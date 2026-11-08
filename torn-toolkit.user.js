// ==UserScript==
// @name         Torn Toolkit
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @version      0.4.1
// @description  Status, travel and foreign stock, training ratios, target estimates, jump planner and market values for Torn. Read-only, uses your own API key.
// @author       fl0w-development
// @license      MIT
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      yata.yt
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// ==/UserScript==

/*
 * Torn Toolkit follows Torn's scripting rules and API Terms of Service:
 *  - Read-only. It never clicks, submits or performs any game action. The gym
 *    Fill button only types a number into Torn's train box; the player presses
 *    Train themselves (one click, one action).
 *  - It only uses data from the official API (api.torn.com) or from the page
 *    you are already viewing. It never requests other torn.com pages and never
 *    contacts any other website.
 *  - Your key stays in your browser and is sent only to api.torn.com, in a
 *    request header (never in a URL).
 *  - Requests ask only for the selections each feature needs, are cached and
 *    shared between tabs, and stay far below the 100 requests/minute limit.
 *  - Invalid or disabled keys are removed as soon as the API reports them.
 *  - Live foreign stock comes from YATA (yata.yt), on by default and can be
 *    turned off in settings. Only YATA's public stock list is downloaded; no
 *    key or player data is sent.
 */

(function () {
  'use strict';

  // ===========================================================================
  // Pure logic (no DOM). Exported for the Node tests.
  // ===========================================================================

  // Rank names exactly as the API's UserRankEnum lists them.
  const RANKS = [
    'Absolute beginner', 'Beginner', 'Inexperienced', 'Rookie', 'Novice',
    'Below average', 'Average', 'Reasonable', 'Above average', 'Competent',
    'Highly competent', 'Veteran', 'Distinguished', 'Highly distinguished',
    'Professional', 'Star', 'Master', 'Outstanding', 'Celebrity', 'Supreme',
    'Idolized', 'Champion', 'Heroic', 'Legendary', 'Elite', 'Invincible',
  ];
  const LEVEL_TRIGGERS = [2, 6, 11, 26, 31, 50, 71, 100];
  const CRIME_TRIGGERS = [100, 5000, 10000, 20000, 30000, 50000];
  const NETWORTH_TRIGGERS = [5e6, 5e7, 5e8, 5e9, 5e10];
  const STAT_RANGES = [
    'under 2k', '2k – 25k', '20k – 250k', '200k – 2.5m',
    '2m – 25m', '20m – 250m', 'over 200m',
  ];

  /**
   * Community rank-trigger estimate. A player's rank rises with level, crimes,
   * networth and total battle stats; removing the first three leaves a rough
   * battle stat bracket. Returns null for an unknown rank.
   */
  function estimateStats({ rank, level, crimes, networth }) {
    const title = String(rank || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let rankIndex = -1;
    RANKS.forEach((r, i) => {
      if (title.startsWith(r.toLowerCase()) &&
          (rankIndex === -1 || r.length > RANKS[rankIndex].length)) rankIndex = i;
    });
    if (rankIndex === -1) return null;
    const count = (list, v) => list.filter((t) => (Number(v) || 0) >= t).length;
    const triggers = count(LEVEL_TRIGGERS, level) + count(CRIME_TRIGGERS, crimes) +
      count(NETWORTH_TRIGGERS, networth);
    const idx = Math.max(0, Math.min(STAT_RANGES.length - 1, rankIndex - triggers - 1));
    return { bracket: idx, label: STAT_RANGES[idx], rankIndex, triggers };
  }

  const GYM_CONSTANTS = {
    strength: { a: 1600, b: 1700 },
    speed: { a: 1600, b: 2000 },
    dexterity: { a: 1800, b: 1500 },
    defense: { a: 2100, b: -600 },
  };
  const STATS = ['strength', 'speed', 'dexterity', 'defense'];
  const MAX_HAPPY = 99999;
  const roundTo = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  /** Community (Vladar) gym formula: gain from one train, perks excluded. */
  function gainPerTrain({ stat, happy, gymDots, energyPerTrain, statType }) {
    const c = GYM_CONSTANTS[statType];
    if (!c) throw new Error('Unknown stat: ' + statType);
    const s = Math.min(Math.max(stat, 0), 50e6);
    const h = Math.min(Math.max(happy, 0), MAX_HAPPY);
    const mult = roundTo(1 + 0.07 * roundTo(Math.log(1 + h / 250), 4), 4);
    const gain = (s * mult + 8 * h ** 1.05 + (1 - (h / MAX_HAPPY) ** 2) * c.a + c.b) *
      (1 / 200000) * gymDots * energyPerTrain;
    return Math.max(0, gain);
  }

  /** Spend `energy` train by train; happy drops by ~half the energy of each train. */
  function simulateTraining({ stat, happy, energy, gymDots, energyPerTrain, statType }) {
    let s = stat;
    let h = Math.min(happy, MAX_HAPPY);
    const trains = energyPerTrain > 0 ? Math.floor(energy / energyPerTrain) : 0;
    for (let i = 0; i < trains; i++) {
      s += gainPerTrain({ stat: s, happy: h, gymDots, energyPerTrain, statType });
      h = Math.max(0, h - Math.round(energyPerTrain / 2));
    }
    return { trains, gain: s - stat, endStat: s, endHappy: h };
  }

  // ---- Training ratios -------------------------------------------------------
  // Each stat's partner in the specialist pair gyms (Frontline: str+spd, Balboas: def+dex).
  const PARTNER = { strength: 'speed', speed: 'strength', defense: 'dexterity', dexterity: 'defense' };
  // Specialist gym rules use "25% higher". Targets aim slightly above it so a
  // normal train never drops you below an unlock line.
  const UNLOCK = 1.25;
  const SAFE = 1.27;
  const RATIOS = {
    balanced: 'Balanced (all equal)',
    hanks: "Hank's ratio",
    baldrs: "Baldr's ratio",
    custom: 'Custom',
  };

  /**
   * Target weights per stat.
   * Hank's: main stat at 8.0 gym (1.25× next stat), the other pair at their
   *   7.5 pair gym (pair 1.25× the main + its partner), the main's partner low.
   * Baldr's: main stat at 8.0 gym, main + partner at their 7.5 pair gym, the
   *   other two trained in a normal gym.
   */
  function ratioWeights(kind, primary, custom) {
    const w = { strength: 1, speed: 1, defense: 1, dexterity: 1 };
    if (kind === 'balanced') return w;
    if (kind === 'custom') {
      const out = {};
      STATS.forEach((s, i) => { out[s] = Math.max(0, Number(custom && custom[i]) || 0); });
      return STATS.some((s) => out[s] > 0) ? out : null;
    }
    if (!PARTNER[primary]) return null;
    if (kind === 'hanks') {
      w[primary] = SAFE;
      w[PARTNER[primary]] = 0.3;
      return w;
    }
    if (kind === 'baldrs') {
      STATS.forEach((s) => { w[s] = 0.88; });
      w[primary] = SAFE;
      w[PARTNER[primary]] = 1;
      return w;
    }
    return null;
  }

  const SINGLE_GYM = { strength: 'Gym 3000', defense: 'Mr. Isoyamas', speed: 'Total Rebound', dexterity: 'Elites' };
  const PAIR_GYM = { strength: 'Frontline Fitness', speed: 'Frontline Fitness', defense: 'Balboas Gym', dexterity: 'Balboas Gym' };

  /** The specialist gyms a named ratio is built to keep. Balanced/custom keep none. */
  function ratioGyms(kind, primary) {
    if (!PARTNER[primary]) return [];
    if (kind === 'hanks') {
      const other = STATS.find((s) => s !== primary && s !== PARTNER[primary]);
      return [SINGLE_GYM[primary], PAIR_GYM[other]];
    }
    if (kind === 'baldrs') return [SINGLE_GYM[primary], PAIR_GYM[primary]];
    return [];
  }

  /** Specialist gym requirements, checked against current stats. */
  function gymRequirements(stats) {
    const v = (s) => Number(stats[s]) || 0;
    const pairs = [
      { name: 'Balboas Gym', stats: ['defense', 'dexterity'], other: ['strength', 'speed'] },
      { name: 'Frontline Fitness', stats: ['strength', 'speed'], other: ['defense', 'dexterity'] },
    ].map((g) => {
      const a = v(g.stats[0]) + v(g.stats[1]);
      const b = v(g.other[0]) + v(g.other[1]);
      const ratio = b > 0 ? a / b : (a > 0 ? Infinity : 0);
      return { name: g.name, stats: g.stats, ratio, ok: ratio >= UNLOCK };
    });
    const singles = [['Gym 3000', 'strength'], ['Mr. Isoyamas', 'defense'], ['Total Rebound', 'speed'], ['Elites', 'dexterity']]
      .map(([name, s]) => {
        const next = Math.max(...STATS.filter((o) => o !== s).map(v));
        const ratio = next > 0 ? v(s) / next : (v(s) > 0 ? Infinity : 0);
        return { name, stats: [s], ratio, ok: ratio >= UNLOCK };
      });
    return pairs.concat(singles);
  }

  /**
   * Which stat to train next and how many trains in the current gym.
   * Trains the stat furthest below its target until it catches up with the
   * next stat, energy runs out, or one more train would lose a specialist gym
   * in `protect` that you currently qualify for.
   */
  function recommendTrain({ stats, weights, gym, energy, happy, protect = [], onlyTrainable = false }) {
    const active = STATS.filter((s) => weights[s] > 0);
    if (!active.length) return null;
    const score = (st, s) => (Number(st[s]) || 0) / weights[s];
    // onlyTrainable: pick the most-behind stat this gym can train (used as a fallback).
    const pool = onlyTrainable ? active.filter((s) => gym.modifiers[s] > 0) : active;
    if (!pool.length) return null;
    const stat = pool.slice().sort((a, b) => score(stats, a) - score(stats, b))[0];
    const others = active.filter((s) => s !== stat).map((s) => score(stats, s));
    const goal = others.length ? Math.min(...others) * weights[stat] : Infinity;
    const dots = gym.modifiers[stat] || 0;
    if (!dots) return { stat, trains: 0, reason: 'gym' };
    const maxTrains = Math.floor((Number(energy) || 0) / gym.energy_cost);
    if (maxTrains < 1) return { stat, trains: 0, reason: 'energy' };

    const keep = gymRequirements(stats).filter((r) => r.ok && protect.includes(r.name)).map((r) => r.name);
    const st = { ...stats };
    let h = Math.min(Number(happy) || 0, MAX_HAPPY);
    let trains = 0, gain = 0;
    while (trains < maxTrains) {
      const g = gainPerTrain({ stat: st[stat], happy: h, gymDots: dots, energyPerTrain: gym.energy_cost, statType: stat });
      const next = { ...st, [stat]: st[stat] + g };
      const lost = gymRequirements(next).filter((r) => keep.includes(r.name) && !r.ok);
      if (lost.length) {
        return trains ? { stat, trains, gain, reason: 'limit', limitedBy: lost[0].name }
          : { stat, trains: 0, reason: 'blocked', limitedBy: lost[0].name };
      }
      st[stat] = next[stat];
      gain += g;
      trains++;
      h = Math.max(0, h - Math.round(gym.energy_cost / 2));
      if (st[stat] >= goal) break;
    }
    return { stat, trains, gain, reason: st[stat] >= goal ? 'caughtUp' : 'energy-cap' };
  }

  /** "Increases happiness by 25 and booster cooldown by 30 minutes." -> 25 */
  function parseHappy(effect) {
    const m = String(effect || '').match(/happiness by\s*\+?([\d,]+)/i) ||
      String(effect || '').match(/\+\s*([\d,]+)\s*happ/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  /** "... booster cooldown by 30 minutes." -> 1800 (seconds) */
  function parseBoosterSeconds(effect) {
    const m = String(effect || '').match(/booster cooldown by\s*([\d.]+)\s*(minute|hour)/i);
    if (!m) return null;
    return Math.round(Number(m[1]) * (/hour/i.test(m[2]) ? 3600 : 60));
  }

  /** Candy items from /torn/items, cheapest money-per-happy first. */
  function candyOptions(items) {
    return (items || [])
      .filter((it) => it && it.type === 'Candy')
      .map((it) => ({
        id: it.id,
        name: it.name,
        happy: parseHappy(it.effect),
        boosterSec: parseBoosterSeconds(it.effect),
        price: (it.value && it.value.market_price) || 0,
      }))
      .filter((o) => o.happy > 0 && o.price > 0)
      .map((o) => ({ ...o, perHappy: o.price / o.happy }))
      .sort((a, b) => a.perHappy - b.perHappy);
  }

  /** How many candies fit before the booster cooldown reaches its cap. */
  function maxCandies({ boosterNow, capSeconds, perCandySeconds }) {
    if (!perCandySeconds) return Infinity;
    return Math.max(0, Math.floor((capSeconds - Math.max(0, boosterNow)) / perCandySeconds));
  }

  /** Torn API error codes -> what the script must do. */
  function classifyError(code) {
    // Invalid or disabled keys must be removed (API docs: repeated requests
    // with invalid keys can get the user's IP temporarily banned).
    if ([2, 10, 13, 18].includes(code)) return { action: 'removeKey' };
    if (code === 16) return { action: 'accessLevel' };
    if (code === 8 || code === 9 || code === 24) return { action: 'backoff', seconds: 300 };
    if (code === 5) return { action: 'backoff', seconds: 60 };
    return { action: 'backoff', seconds: 30 };
  }

  /**
   * Notification state machine. `armed` maps event id -> unix time it is due.
   * Events fire once, only after we saw them still counting down, so nothing
   * fires on first install or for things that were already ready.
   */
  function updateTimers(armed, timers, nowSec) {
    const next = { ...armed };
    const fire = [];
    for (const t of timers) {
      if (t.secondsLeft > 0) {
        next[t.id] = nowSec + t.secondsLeft;
      } else if (next[t.id]) {
        fire.push(t);
        delete next[t.id];
      }
    }
    for (const id of Object.keys(next)) {
      if (!timers.some((t) => t.id === id)) delete next[id];
    }
    return { armed: next, fire };
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
      m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  // Live timers must include seconds even when hours/days are left. Keep
  // formatDuration concise for static labels such as flight estimates.
  function formatCountdown(sec) {
    sec = Math.max(0, Math.ceil(Number(sec) || 0));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
      m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d) return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  function formatMoney(n) {
    if (n == null || !isFinite(n)) return '–';
    const abs = Math.abs(n);
    const [div, unit] = abs >= 1e12 ? [1e12, 't'] : abs >= 1e9 ? [1e9, 'b'] :
      abs >= 1e6 ? [1e6, 'm'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
    const v = n / div;
    const txt = div === 1 ? String(Math.round(v)) : v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
    return '$' + txt.replace(/\.0+$|(\.\d*?)0+$/, '$1') + unit;
  }

  const formatNumber = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

  // Base one-way Standard flight minutes (Torn Travel Handbook; real flights vary ±3%).
  const FLIGHT_MINUTES = {
    'Mexico': 25, 'Cayman Islands': 33, 'Canada': 39, 'Hawaii': 127,
    'United Kingdom': 151, 'Argentina': 158, 'Switzerland': 166, 'Japan': 213,
    'China': 229, 'UAE': 257, 'South Africa': 281,
  };
  // Time multipliers: airstrip 30% faster, WLT private jet 50%, business class 70%.
  const METHOD_MULT = { Standard: 1, Airstrip: 0.7, Private: 0.5, Business: 0.3 };
  const METHOD_LABEL = { Standard: 'Standard', Airstrip: 'Airstrip', Private: 'Private jet (WLT)', Business: 'Business class' };

  /**
   * One-way seconds. Uses the player's own measured flight when we have one
   * (calibration[country][method]), otherwise the base table.
   */
  function flightSeconds(country, method, calibration) {
    const measured = calibration && calibration[country] && calibration[country][method];
    if (measured) return { seconds: measured, measured: true };
    const base = FLIGHT_MINUTES[country];
    if (!base) return null;
    return { seconds: Math.round(base * 60 * (METHOD_MULT[method] || 1)), measured: false };
  }

  /** Save a finished/ongoing flight's real duration as a calibration point. */
  function calibrate(calibration, travel) {
    if (!travel || !travel.method || !travel.departed_at || !travel.arrival_at) return calibration;
    const dur = travel.arrival_at - travel.departed_at;
    const dest = travel.destination;
    // A flight home reports "Torn" as its destination, so only outbound legs are recorded.
    if (!FLIGHT_MINUTES[dest] || dur <= 0 || dur > 6 * 3600) return calibration;
    return { ...calibration, [dest]: { ...(calibration[dest] || {}), [travel.method]: dur } };
  }

  // YATA country codes -> Torn country names.
  const YATA_COUNTRIES = {
    mex: 'Mexico', cay: 'Cayman Islands', can: 'Canada', haw: 'Hawaii', uni: 'United Kingdom',
    arg: 'Argentina', swi: 'Switzerland', jap: 'Japan', chi: 'China', uae: 'UAE', sou: 'South Africa',
  };

  /** YATA /travel/export -> { country: { update, items: { id: { name, qty, cost } } } } */
  function parseYata(json) {
    const out = {};
    const stocks = (json && json.stocks) || {};
    for (const [code, c] of Object.entries(stocks)) {
      const country = YATA_COUNTRIES[code];
      if (!country || !c || !Array.isArray(c.stocks)) continue;
      const items = {};
      for (const s of c.stocks) {
        if (s && Number.isFinite(s.id)) items[s.id] = { name: s.name, qty: Math.max(0, Number(s.quantity) || 0), cost: s.cost };
      }
      out[country] = { update: Number(c.update) || 0, items };
    }
    return out;
  }

  /**
   * Restocks we have seen ourselves: compares two snapshots of the same
   * country. history[country][id] = { restockAt, emptySince }.
   */
  function updateStockHistory(history, prev, next) {
    const h = JSON.parse(JSON.stringify(history || {}));
    for (const [country, snap] of Object.entries(next || {})) {
      const old = prev && prev[country];
      if (!old || snap.update <= old.update) continue;
      const hc = h[country] = h[country] || {};
      for (const [id, it] of Object.entries(snap.items)) {
        const before = old.items[id];
        const rec = hc[id] = hc[id] || {};
        if (before && it.qty > before.qty) { rec.restockAt = snap.update; delete rec.emptySince; }
        if (it.qty === 0 && (!before || before.qty > 0)) rec.emptySince = snap.update;
        if (it.qty > 0) delete rec.emptySince;
      }
    }
    return h;
  }

  /**
   * Foreign-shop items -> profit if a load is resold at market value.
   * `items` is the /torn/items array. With `stock` (from YATA), a load is
   * limited to what is on the shelf. Returns per-country runs, best first.
   */
  function travelRuns(items, { capacity, method, calibration, stock, budget = 0, minMargin = 0.05, top = 3 }) {
    const byCountry = {};
    for (const it of items || []) {
      const market = it.value && it.value.market_price;
      if (!market) continue;
      for (const s of (it.value && it.value.shops) || []) {
        if (!s || s.country === 'Torn' || !s.buy_price || !FLIGHT_MINUTES[s.country]) continue;
        const profit = market - s.buy_price;
        // Market value is an average sale price; thin margins are not reliable profit.
        if (profit <= 0 || profit / s.buy_price < minMargin) continue;
        const shelf = stock && stock[s.country] && stock[s.country].items[it.id];
        const qty = shelf ? shelf.qty : null;
        let load = qty == null ? capacity : Math.min(capacity, qty);
        if (budget > 0) load = Math.min(load, Math.floor(budget / s.buy_price));
        (byCountry[s.country] = byCountry[s.country] || []).push({
          id: it.id, name: it.name, type: it.type, buy: s.buy_price, market, profit,
          qty, load, tripProfit: profit * load,
        });
      }
    }
    return Object.keys(FLIGHT_MINUTES).map((country) => {
      const all = (byCountry[country] || []).sort((a, b) => b.tripProfit - a.tripProfit || b.profit - a.profit);
      const best = all.filter((x) => x.tripProfit > 0).slice(0, top);
      const f = flightSeconds(country, method, calibration);
      const roundTrip = f.seconds * 2;
      const perTrip = best.length ? best[0].tripProfit : 0;
      return {
        country, items: best, soldOut: all.filter((x) => x.qty === 0).slice(0, top),
        oneWay: f.seconds, measured: f.measured, roundTrip,
        perTrip, perHour: roundTrip ? perTrip / (roundTrip / 3600) : 0,
        cost: best.length ? best[0].buy * best[0].load : 0,
        stockUpdate: stock && stock[country] ? stock[country].update : null,
      };
    }).sort((a, b) => b.perHour - a.perHour);
  }

  const logic = {
    estimateStats, gainPerTrain, simulateTraining, parseHappy, parseBoosterSeconds,
    candyOptions, maxCandies, classifyError, updateTimers, formatDuration, formatCountdown,
    formatMoney, formatNumber, flightSeconds, calibrate, travelRuns,
    parseYata, updateStockHistory, YATA_COUNTRIES,
    ratioWeights, ratioGyms, gymRequirements, recommendTrain, RATIOS, PARTNER,
    STAT_RANGES, RANKS, FLIGHT_MINUTES, METHOD_MULT,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = logic; return; }

  // ===========================================================================
  // Browser side
  // ===========================================================================

  const VERSION = '0.4.1';
  const API = 'https://api.torn.com/v2/';
  // Torn PDA (mobile app) replaces this placeholder with the user's key.
  const PDA_KEY = '###PDA-APIKEY###';
  const hasPdaKey = !PDA_KEY.includes('#');

  // ---------------------------------------------------------------- storage
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const store = {
    get(k, d) {
      try {
        if (hasGM) return GM_getValue(k, d);
        const v = localStorage.getItem('tt_' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { hasGM ? GM_setValue(k, v) : localStorage.setItem('tt_' + k, JSON.stringify(v)); }
      catch (e) { /* storage full or blocked: features still work uncached */ }
    },
    del(k) {
      try { hasGM && typeof GM_deleteValue === 'function' ? GM_deleteValue(k) : localStorage.removeItem('tt_' + k); }
      catch (e) { /* ignore */ }
    },
  };

  const DEFAULTS = {
    hud: true, market: true, target: true, jump: true, travel: true, foreignStock: true, notify: false,
    boosterCapHours: 24, travelMethod: 'auto', travelCapacity: 0, travelBudget: 0, collapsed: false, pos: null,
    ratio: true, ratioOnPage: true, ratioKind: 'balanced', ratioPrimary: 'dexterity', ratioCustom: [1, 1, 1, 1],
  };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  const getKey = () => (hasPdaKey ? PDA_KEY : store.get('apiKey', ''));

  // ---------------------------------------------------------------- API
  class ApiError extends Error {
    constructor(kind, message, code) { super(message); this.kind = kind; this.code = code; }
  }
  const memCache = new Map();
  const inflight = new Map();
  const recentCalls = [];

  /**
   * GET an API v2 path. `ttl` is in seconds. `persist` caches in userscript
   * storage so every open Torn tab shares one result instead of re-fetching.
   */
  async function api(path, params, { ttl = 30, persist = false } = {}) {
    const key = getKey();
    if (!key) throw new ApiError('nokey', 'Add your API key in settings to start.');
    const qs = new URLSearchParams(params || {});
    const id = path + '?' + qs.toString();
    const cached = memCache.get(id) || (persist ? store.get('c:' + id, null) : null);
    if (cached && Date.now() - cached.t < ttl * 1000) return cached.data;
    if (inflight.has(id)) return inflight.get(id);

    const backoff = store.get('backoffUntil', 0);
    if (Date.now() < backoff) {
      if (cached) return cached.data;
      throw new ApiError('backoff', `The Torn API asked us to slow down. Retrying in ${formatDuration((backoff - Date.now()) / 1000)}.`);
    }
    const now = Date.now();
    while (recentCalls.length && now - recentCalls[0] > 60000) recentCalls.shift();
    if (recentCalls.length >= 30) {
      if (cached) return cached.data;
      throw new ApiError('backoff', 'Pausing API calls for a moment to stay under the rate limit.');
    }
    recentCalls.push(now);

    qs.set('comment', 'TornToolkit');
    const p = (async () => {
      let data;
      try {
        const res = await fetch(API + path + '?' + qs.toString(), { headers: { Authorization: 'ApiKey ' + key } });
        data = await res.json();
      } catch (e) {
        if (cached) return cached.data;
        throw new ApiError('network', 'Could not reach the Torn API. Check your connection.');
      }
      if (data && data.error) {
        const { code, error } = data.error;
        const c = classifyError(code);
        if (c.action === 'removeKey') {
          if (!hasPdaKey) store.del('apiKey');
          store.set('keyNotice', `Your API key was removed because Torn reported: “${String(error).replace(/\.+$/, '')}”. Add a working key in settings.`);
          throw new ApiError('removedKey', error, code);
        }
        if (c.action === 'accessLevel') throw new ApiError('access', 'Your API key’s access level is too low for this. Use a Limited Access key.', code);
        store.set('backoffUntil', Date.now() + c.seconds * 1000);
        if (cached) return cached.data;
        throw new ApiError('backoff', `Torn API: ${error}. Retrying in ${formatDuration(c.seconds)}.`, code);
      }
      const entry = { t: Date.now(), data };
      memCache.set(id, entry);
      if (persist) store.set('c:' + id, entry);
      return data;
    })();
    inflight.set(id, p);
    try { return await p; } finally { inflight.delete(id); }
  }

  /**
   * One cached /torn/items call (hourly, shared by all tabs), trimmed to what
   * the market badges and travel helper need.
   */
  let itemDataPromise = null;
  function getItemData() {
    if (itemDataPromise) return itemDataPromise;
    itemDataPromise = (async () => {
      const cached = store.get('itemData', null);
      if (cached && Date.now() - cached.t < 3600e3) return cached;
      const d = await api('torn/items', {}, { ttl: 3600 });
      const prices = {};
      const abroad = [];
      for (const it of d.items || []) {
        const market = (it.value && it.value.market_price) || 0;
        prices[it.id] = [it.name, market];
        const shops = ((it.value && it.value.shops) || []).filter((s) => s && s.country !== 'Torn' && s.buy_price);
        if (shops.length) abroad.push({ id: it.id, name: it.name, type: it.type, value: { market_price: market, shops } });
      }
      const data = { t: Date.now(), prices, abroad };
      store.set('itemData', data);
      return data;
    })();
    itemDataPromise.catch(() => { itemDataPromise = null; });
    return itemDataPromise;
  }

  // ---------------------------------------------------------------- DOM helpers
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }
  const row = (label, value, cls) => h('div', { class: 'tt-row' }, h('span', { class: 'tt-label' }, label),
    h('span', { class: 'tt-value ' + (cls || '') }, value));
  const notice = (text, kind) => h('div', { class: 'tt-notice tt-notice-' + (kind || 'info') }, text);

  // ---------------------------------------------------------------- styles
  const CSS = `
  .tt-root{--bg:#ffffff;--surface:#f4f5f7;--border:#dcdfe4;--text:#1f2328;--muted:#68707c;--accent:#2f6fde;
    --ok:#1d8348;--warn:#a85d00;--err:#c0392b;--shadow:0 8px 24px rgba(15,23,42,.14),0 1px 3px rgba(15,23,42,.08);
    --energy:#3fae4b;--nerve:#d9443b;--happy:#e2b100;--life:#3d8fd6;
    position:fixed;z-index:9999;width:280px;max-width:calc(100vw - 32px);box-sizing:border-box;
    font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--text);
    background:var(--bg);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);overflow:hidden}
  body.dark-mode .tt-root,.tt-root.tt-dark{--bg:#1d1f23;--surface:#26292e;--border:#363a41;--text:#e7e9ec;--muted:#9aa1ab;
    --accent:#6ea8ff;--ok:#4cc27a;--warn:#f0b35a;--err:#ff7b72;--shadow:0 8px 24px rgba(0,0,0,.45)}
  .tt-root *{box-sizing:border-box}
  .tt-root [hidden]{display:none!important}
  .tt-root.tt-inline{position:relative;z-index:1;width:100%;max-width:100%;margin:0 0 12px;box-shadow:none;overflow:hidden}
  .tt-inline .tt-head{cursor:default;touch-action:auto;min-height:44px}
  .tt-inline .tt-head:active{cursor:default}
  .tt-inline .tt-body{max-height:none;overflow:visible}
  .tt-inline.tt-collapsed{border-radius:6px}
  .tt-inline.tt-collapsed .tt-head{border:0}
  .tt-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;cursor:grab;user-select:none;touch-action:none;
    border-bottom:1px solid var(--border)}
  .tt-root.tt-collapsed .tt-head{border-bottom:0}
  .tt-head:active{cursor:grabbing}
  .tt-title{font-weight:600;font-size:13px;letter-spacing:.01em;white-space:nowrap}
  .tt-mini{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
  .tt-tag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font-size:10.5px;font-weight:600;background:var(--surface);color:var(--accent);vertical-align:1px}
  .tt-icon{all:unset;display:grid;place-items:center;width:26px;height:26px;border-radius:6px;color:var(--muted);cursor:pointer}
  .tt-icon:hover{background:var(--surface);color:var(--text)}
  .tt-icon:focus-visible,.tt-tab:focus-visible,.tt-btn:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .tt-icon svg{width:16px;height:16px}
  .tt-tabs{display:flex;gap:2px;padding:6px 8px 0}
  .tt-tab{all:unset;flex:1;text-align:center;padding:5px 0;border-radius:6px;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer}
  .tt-tab:hover{color:var(--text);background:var(--surface)}
  .tt-tab[aria-selected=true]{color:var(--text);background:var(--surface);box-shadow:inset 0 -2px 0 var(--accent)}
  .tt-body{padding:10px 12px 12px;max-height:min(70vh,560px);overflow:auto}
  .tt-section{margin-top:12px}.tt-section:first-child{margin-top:0}
  .tt-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px}
  .tt-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:2px 0}
  .tt-label{color:var(--muted)}
  .tt-value{font-variant-numeric:tabular-nums;text-align:right}
  .tt-ok{color:var(--ok)}.tt-warn{color:var(--warn)}.tt-err{color:var(--err)}.tt-strong{font-weight:600}
  .tt-bar{margin-bottom:8px}
  .tt-bar-top{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums}
  .tt-bar-name{font-weight:500}
  .tt-track{height:6px;margin-top:4px;background:var(--surface);border-radius:999px;overflow:hidden}
  .tt-fill{height:100%;border-radius:999px;transition:width .4s ease}
  .tt-sub{font-size:11.5px;color:var(--muted)}
  .tt-foot{display:flex;justify-content:space-between;padding:6px 12px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);background:var(--surface)}
  .tt-notice{padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:8px;background:var(--surface);border:1px solid var(--border)}
  .tt-notice-err{border-color:color-mix(in srgb,var(--err) 45%,transparent);color:var(--err)}
  .tt-notice-warn{border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
  .tt-badge{display:inline-flex;align-items:center;gap:6px;font-weight:600}
  .tt-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--muted)}
  .tt-big{font-size:18px;font-weight:700;letter-spacing:-.01em}
  .tt-field{display:block;margin-top:8px}
  .tt-field>span{display:block;font-size:12px;color:var(--muted);margin-bottom:3px}
  .tt-input{width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit}
  .tt-input:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
  .tt-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
  .tt-check{display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer}
  .tt-check input{accent-color:var(--accent);width:15px;height:15px;margin:0}
  .tt-result{margin-top:12px;padding:10px;border-radius:8px;background:var(--surface)}
  .tt-btn{all:unset;display:inline-flex;justify-content:center;align-items:center;padding:7px 12px;border-radius:7px;font-weight:600;font-size:12.5px;cursor:pointer;
    background:var(--accent);color:#fff}
  .tt-btn:hover{filter:brightness(1.08)}
  .tt-btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
  .tt-btn-danger{background:transparent;color:var(--err);border:1px solid var(--border)}
  .tt-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
  .tt-modal .tt-actions{position:sticky;bottom:-12px;margin:14px -12px -12px;padding:10px 12px;background:var(--bg);border-top:1px solid var(--border)}
  .tt-body>.tt-notice:not(:first-child){margin-top:12px}
  #fl0w-torn-toolkit-settings-overlay{position:fixed;inset:0;z-index:10000;background:rgba(10,12,16,.45);display:grid;place-items:center;padding:16px}
  .tt-modal{position:static;width:440px;max-width:100%;max-height:calc(100vh - 32px);overflow:auto}
  .tt-modal .tt-head{cursor:default}
  .tt-tos{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
  .tt-tos th,.tt-tos td{text-align:left;padding:5px 6px;border-top:1px solid var(--border);vertical-align:top}
  .tt-tos th{color:var(--muted);font-weight:500;width:46%}
  .tt-trip{border-top:1px solid var(--border)}
  .tt-section-title+.tt-trip{border-top:0}
  .tt-trip-head{all:unset;display:block;width:calc(100% + 12px);box-sizing:border-box;padding:8px 6px;margin:0 -6px;border-radius:6px;cursor:pointer}
  .tt-open .tt-trip-head{background:var(--surface)}
  .tt-trip-head:hover{background:var(--surface)}
  .tt-trip-head:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
  .tt-trip .tt-row{padding:1px 0}
  .tt-details{padding:2px 0 10px}
  .tt-item{padding:6px 8px;margin-top:6px;border-radius:6px;background:var(--surface)}
  .tt-item .tt-row{padding:0}
  .tt-item .tt-row>span:last-child,.tt-trip .tt-row>span:last-child{white-space:nowrap}
  .tt-grid-wide{grid-template-columns:3fr 2fr}
  .tt-link{color:var(--accent)}
  .tt-grid-one{grid-template-columns:1fr}
  .tt-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:0 6px}
  .tt-fill-btn{display:block;margin:6px auto 0;padding:4px 10px;border:0;border-radius:6px;background:#2f6fde;color:#fff;font:600 12px/1.4 system-ui,Arial,sans-serif;cursor:pointer}
  .tt-fill-btn:hover{filter:brightness(1.1)}
  .tt-fill-btn:focus-visible{outline:2px solid #2f6fde;outline-offset:2px}
  .tt-mv{display:inline-block;margin:2px 4px;padding:1px 5px;border-radius:4px;font:600 10px/1.4 system-ui,Arial,sans-serif;
    color:#0f5132;background:#d1f0dd;vertical-align:middle;white-space:nowrap;pointer-events:none}
  body.dark-mode .tt-mv{color:#b9f0cd;background:#17402a}
  @media (max-width:600px){
    .tt-root.tt-inline{width:100%;max-width:100%;margin:0 0 10px;border-radius:8px}
    .tt-inline .tt-head{padding:6px 8px;gap:6px}
    .tt-inline .tt-tabs{flex-wrap:wrap}
    .tt-inline .tt-tab{min-width:68px;min-height:40px}
    .tt-inline .tt-icon{min-width:40px;min-height:40px}
    .tt-inline .tt-grid,.tt-inline .tt-grid-wide{grid-template-columns:minmax(0,1fr)}
    .tt-inline .tt-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}
    .tt-inline .tt-row{flex-wrap:wrap;gap:4px 8px}
    .tt-inline .tt-body{padding:10px}
    .tt-inline .tt-input,.tt-modal .tt-input{font-size:16px;min-height:44px}
    .tt-inline .tt-btn,.tt-modal .tt-btn{min-height:40px}
    .tt-modal{width:100%;max-height:calc(100dvh - 24px)}
    #fl0w-torn-toolkit-settings-overlay{padding:12px}
  }
  @media (prefers-reduced-motion:reduce){.tt-fill{transition:none}}`;

  const ICONS = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };
  const iconBtn = (name, label, onclick) => {
    const b = h('button', { class: 'tt-icon', type: 'button', title: label, 'aria-label': label, onclick });
    b.innerHTML = ICONS[name]; // static, trusted SVG
    return b;
  };

  // ---------------------------------------------------------------- page context
  function pageContext() {
    const u = new URL(location.href);
    if (u.pathname === '/profiles.php') return { page: 'profile', targetId: u.searchParams.get('XID') };
    if (u.pathname === '/loader.php' && u.searchParams.get('sid') === 'attack') return { page: 'attack', targetId: u.searchParams.get('user2ID') };
    if (u.pathname === '/gym.php') return { page: 'gym' };
    if (['/travelagency.php', '/travel.php', '/abroad.php'].includes(u.pathname)) return { page: 'travel' };
    return { page: 'other' };
  }
  const isToolPage = (c) => ['profile', 'attack', 'gym', 'travel'].includes(c.page);

  // ---------------------------------------------------------------- in-page toolkit
  let dock, bodyEl, tabsEl, footEl, miniEl, collapseBtn;
  let ctx = pageContext();
  const views = {}; // tab id -> { title, render(container), tick?() }

  // Insert into Torn's content flow, never over its controls. Torn uses different
  // wrappers on desktop and mobile, so keep several safe fallbacks.
  function inlineHost() {
    const selectors = ['.content-wrapper', '#mainContainer', '#main-content',
      '[class*="contentWrapper"]', 'main', '#content'];
    for (const selector of selectors) {
      const host = document.querySelector(selector);
      if (host && host !== dock && !host.closest('.tt-root')) return host;
    }
    return document.body;
  }

  function mountInlineDock() {
    if (!dock) return;
    const host = inlineHost();
    if (host && dock.parentElement !== host) host.prepend(dock);
  }

  function buildDock() {
    document.head.append(h('style', { id: 'tt-style' }, CSS));
    // The previous floating-panel preference is intentionally ignored:
    // ordinary pages start compact; relevant pages open their own tools.
    settings.collapsed = Boolean(getKey()) && !isToolPage(ctx);
    miniEl = h('span', { class: 'tt-mini', 'aria-live': 'off' });
    collapseBtn = iconBtn(settings.collapsed ? 'down' : 'up',
      settings.collapsed ? 'Show toolkit' : 'Hide toolkit', toggleCollapse);
    const head = h('div', { class: 'tt-head' },
      h('span', { class: 'tt-title' }, 'Torn Toolkit'),
      miniEl, iconBtn('gear', 'Settings', openSettings), collapseBtn);
    tabsEl = h('div', { class: 'tt-tabs', role: 'tablist' });
    bodyEl = h('div', { class: 'tt-body', role: 'tabpanel' });
    footEl = h('div', { class: 'tt-foot' });
    dock = h('section', {
      id: 'fl0w-torn-toolkit-inline',
      class: 'tt-root tt-inline' + (settings.collapsed ? ' tt-collapsed' : ''),
      'aria-label': 'Torn Toolkit',
    }, head, tabsEl, bodyEl, footEl);
    mountInlineDock();
    applyCollapsed();
  }

  function toggleCollapse() {
    settings.collapsed = !settings.collapsed;
    // This is per-page UI state; it must not change your saved preferences.
    applyCollapsed();
  }

  function applyCollapsed() {
    dock.classList.toggle('tt-collapsed', settings.collapsed);
    tabsEl.hidden = settings.collapsed || availableTabs().length < 2;
    [bodyEl, footEl].forEach((n) => { n.hidden = settings.collapsed; });
    collapseBtn.innerHTML = ICONS[settings.collapsed ? 'down' : 'up'];
    collapseBtn.title = settings.collapsed ? 'Show toolkit' : 'Hide toolkit';
    collapseBtn.setAttribute('aria-label', collapseBtn.title);
    collapseBtn.setAttribute('aria-expanded', String(!settings.collapsed));
    if (!settings.collapsed) renderActive();
  }

  function availableTabs() {
    const t = [];
    if (settings.hud) t.push('status');
    if (settings.travel) t.push('travel');
    if (settings.target && ctx.targetId && /^\d+$/.test(ctx.targetId)) t.push('target');
    if ((settings.jump || settings.ratio) && ctx.page === 'gym') t.push('gym');
    return t;
  }
  let activeTab = null;
  function renderTabs() {
    const tabs = availableTabs();
    // Open the page's own tool first (target on profiles, gym on the gym page).
    const preferred = ctx.page === 'gym' ? 'gym' : ctx.targetId ? 'target' : ctx.page === 'travel' ? 'travel' : 'status';
    if (!tabs.includes(activeTab)) activeTab = tabs.includes(preferred) ? preferred : tabs[0] || null;
    tabsEl.replaceChildren(...(tabs.length > 1 ? tabs.map((id) => h('button', {
      class: 'tt-tab', type: 'button', role: 'tab', 'aria-selected': String(id === activeTab),
      onclick: () => { activeTab = id; renderTabs(); renderActive(); },
    }, views[id].title)) : []));
    tabsEl.hidden = settings.collapsed || tabs.length < 2;
  }
  function renderActive() {
    if (settings.collapsed) return;
    const v = views[activeTab];
    bodyEl.replaceChildren();
    const keyNotice = store.get('keyNotice', '');
    if (keyNotice) bodyEl.append(notice(keyNotice, 'err'));
    if (!getKey()) {
      bodyEl.append(h('div', { class: 'tt-section' },
        h('div', { class: 'tt-big' }, 'Welcome'),
        h('p', { class: 'tt-sub' }, 'Add your Torn API key to see your bars, cooldowns, market values and target estimates. Your key stays in your browser.'),
        h('div', { class: 'tt-actions' }, h('button', { class: 'tt-btn', type: 'button', onclick: openSettings }, 'Add API key'))));
      setFoot('', '');
      return;
    }
    if (!v) { bodyEl.append(h('p', { class: 'tt-sub' }, 'All panels are turned off. Turn them on in settings.')); return; }
    v.render(bodyEl);
  }
  function setFoot(left, right) { footEl.replaceChildren(h('span', {}, left), h('span', {}, right)); }

  // ---------------------------------------------------------------- notifications
  function notify(title, text) {
    try {
      if (typeof GM_notification === 'function') GM_notification({ title, text, timeout: 10000 });
      else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text });
    } catch (e) { /* notifications unavailable */ }
  }

  // ---------------------------------------------------------------- Status view
  const statusState = { data: null, fetchedAt: 0, error: null };
  const BAR_COLORS = { energy: 'var(--energy)', nerve: 'var(--nerve)', happy: 'var(--happy)', life: 'var(--life)' };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  async function refreshStatus() {
    if (!getKey()) return;
    try {
      const d = await api('user', { selections: 'bars,cooldowns,travel,education' }, { ttl: 55, persist: true });
      const cached = store.get('c:user?selections=bars%2Ccooldowns%2Ctravel%2Ceducation', null);
      statusState.data = d;
      statusState.fetchedAt = cached ? cached.t : Date.now();
      statusState.error = null;
      recordCalibration(d.travel);
    } catch (e) {
      statusState.error = e;
    }
    checkTimers();
    if (activeTab === 'status') renderActive();
    updateMini();
  }

  function liveTimers() {
    const d = statusState.data;
    if (!d) return [];
    const elapsed = (Date.now() - statusState.fetchedAt) / 1000;
    const left = (s) => Math.max(0, (Number(s) || 0) - elapsed);
    const t = [];
    if (d.bars) {
      t.push({ id: 'energy', secondsLeft: left(d.bars.energy.full_time), msg: 'Your energy is full.' });
      t.push({ id: 'nerve', secondsLeft: left(d.bars.nerve.full_time), msg: 'Your nerve is full.' });
    }
    if (d.cooldowns) {
      t.push({ id: 'drug', secondsLeft: left(d.cooldowns.drug), msg: 'Your drug cooldown has ended.' });
      t.push({ id: 'booster', secondsLeft: left(d.cooldowns.booster), msg: 'Your booster cooldown has ended.' });
    }
    if (d.travel && d.travel.time_left > 0) {
      t.push({ id: 'travel', secondsLeft: left(d.travel.time_left), msg: `You have landed in ${d.travel.destination}.` });
    }
    const edu = d.education && d.education.current;
    if (edu && edu.until) t.push({ id: 'education', secondsLeft: Math.max(0, edu.until - Date.now() / 1000), msg: 'Your education course has finished.' });
    return t;
  }

  function checkTimers() {
    if (!settings.notify || !statusState.data) return;
    const { armed, fire } = updateTimers(store.get('armed', {}), liveTimers(), Math.floor(Date.now() / 1000));
    store.set('armed', armed);
    fire.forEach((t) => notify('Torn Toolkit', t.msg));
  }

  function updateMini() {
    const d = statusState.data;
    if (!d || !d.bars) { miniEl.textContent = ''; return; }
    miniEl.textContent = `E ${d.bars.energy.current}/${d.bars.energy.maximum} · N ${d.bars.nerve.current}/${d.bars.nerve.maximum}`;
  }

  views.status = {
    title: 'Status',
    render(el) {
      const { data: d, error } = statusState;
      if (error && error.kind !== 'backoff') el.append(notice(error.message, 'err'));
      else if (error) el.append(notice(error.message, 'warn'));
      if (!d) { if (!error) el.append(h('p', { class: 'tt-sub' }, 'Loading…')); return; }
      const elapsed = (Date.now() - statusState.fetchedAt) / 1000;
      const left = (s) => Math.max(0, (Number(s) || 0) - elapsed);

      const bars = h('div', { class: 'tt-section' });
      for (const b of ['energy', 'nerve', 'happy', 'life']) {
        const bar = d.bars && d.bars[b];
        if (!bar) continue;
        const full = left(bar.full_time);
        const pct = bar.maximum ? Math.min(100, (bar.current / bar.maximum) * 100) : 0;
        bars.append(h('div', { class: 'tt-bar' },
          h('div', { class: 'tt-bar-top' },
            h('span', {}, h('span', { class: 'tt-bar-name' }, cap(b)), ' ',
              h('span', { class: 'tt-sub' }, `${formatNumber(bar.current)} / ${formatNumber(bar.maximum)}`)),
            h('span', { class: full ? 'tt-sub' : 'tt-ok' }, bar.current >= bar.maximum ? 'Full' : full ? `full in ${formatCountdown(full)}` : 'Full')),
          h('div', { class: 'tt-track', role: 'progressbar', 'aria-label': cap(b), 'aria-valuemin': '0', 'aria-valuemax': String(bar.maximum), 'aria-valuenow': String(bar.current) },
            h('div', { class: 'tt-fill', style: `width:${pct}%;background:${BAR_COLORS[b]}` }))));
      }
      el.append(bars);

      const cds = h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' }, 'Cooldowns'));
      for (const k of ['drug', 'booster', 'medical']) {
        const t = left(d.cooldowns && d.cooldowns[k]);
        cds.append(row(cap(k), t ? formatCountdown(t) : 'Ready', t ? 'tt-warn' : 'tt-ok'));
      }
      el.append(cds);

      const other = h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' }, 'Activity'));
      const tr = d.travel;
      if (tr && tr.time_left > 0) {
        const t = left(tr.time_left);
        other.append(row(`Flying to ${tr.destination}`, t ? formatCountdown(t) : 'Landed', t ? 'tt-warn' : 'tt-ok'));
      } else {
        other.append(row('Travel', tr && tr.destination && tr.destination !== 'Torn' ? `In ${tr.destination}` : 'In Torn'));
      }
      const edu = d.education && d.education.current;
      if (edu && edu.until) {
        const t = Math.max(0, edu.until - Date.now() / 1000);
        other.append(row('Education', t ? formatCountdown(t) : 'Finished', t ? 'tt-warn' : 'tt-ok'));
      } else {
        other.append(row('Education', 'No course running', 'tt-warn'));
      }
      el.append(other);
      setFoot(`Updated ${formatDuration(elapsed)} ago`, settings.notify ? 'Alerts on' : 'Alerts off');
    },
  };

  // ---------------------------------------------------------------- Target view
  const targetState = { id: null, data: null, error: null };

  async function loadTarget(id) {
    targetState.id = id; targetState.data = null; targetState.error = null;
    if (activeTab === 'target') renderActive();
    try {
      targetState.data = await api('user', { selections: 'profile,personalstats', id, cat: 'popular' }, { ttl: 300 });
    } catch (e) { targetState.error = e; }
    if (targetState.id === id && activeTab === 'target') renderActive();
  }

  views.target = {
    title: 'Target',
    render(el) {
      const { data: d, error } = targetState;
      if (error) { el.append(notice(error.message, error.kind === 'backoff' ? 'warn' : 'err')); return; }
      if (!d) { el.append(h('p', { class: 'tt-sub' }, 'Loading…')); return; }
      const p = d.profile || {};
      const ps = d.personalstats || {};
      const crimes = ps.crimes ? ps.crimes.total : 0;
      const networth = ps.networth ? ps.networth.total : 0;
      const attacks = (ps.attacking && ps.attacking.attacks) || {};
      const est = estimateStats({ rank: p.rank, level: p.level, crimes, networth });
      const statusColor = { green: 'var(--ok)', red: 'var(--err)', blue: 'var(--life)' }[p.status && p.status.color] || 'var(--muted)';

      el.append(h('div', { class: 'tt-section' },
        h('div', { class: 'tt-row' }, h('span', { class: 'tt-strong' }, `${p.name || '?'} [${p.id || targetState.id}]`),
          h('span', { class: 'tt-sub' }, `Level ${p.level ?? '?'}`)),
        h('div', { class: 'tt-sub' }, [p.rank, p.title].filter(Boolean).join(' · ')),
        h('div', { class: 'tt-result' },
          h('div', { class: 'tt-sub' }, 'Estimated battle stats'),
          h('div', { class: 'tt-big' }, est ? est.label : 'Unknown'))));

      el.append(h('div', { class: 'tt-section' },
        row('Status', h('span', { class: 'tt-badge' }, h('span', { class: 'tt-dot', style: `background:${statusColor}` }), (p.status && p.status.description) || '?')),
        row('Last action', (p.last_action && p.last_action.relative) || '?'),
        row('Networth', formatMoney(networth)),
        row('Attacks won / lost', `${formatNumber(attacks.won)} / ${formatNumber(attacks.lost)}`),
        row('Xanax taken', formatNumber(ps.drugs && ps.drugs.xanax)),
        row('Crimes', formatNumber(crimes))));
      el.append(h('p', { class: 'tt-sub', style: 'margin:10px 0 0' }, 'Estimated from rank, level, crimes and networth. A rough range, not exact stats.'));
      setFoot('Cached for 5 minutes', '');
    },
  };

  // ---------------------------------------------------------------- Gym (jump planner) view
  const gymState = { me: null, gyms: null, candy: null, error: null, limited: true, loaded: false, rec: null };
  const gymInputs = {
    statType: 'strength', energy: null, happy: null, statValue: null,
    candyId: null, candyCount: 0, ecstasy: true,
  };

  async function loadGym() {
    gymState.error = null;
    try {
      let me;
      try {
        me = await api('user', { selections: 'bars,cooldowns,battlestats,gym' }, { ttl: 60 });
        gymState.limited = true;
      } catch (e) {
        if (e.kind !== 'access') throw e;
        me = await api('user', { selections: 'bars,cooldowns,gym' }, { ttl: 60 });
        gymState.limited = false;
      }
      const [gyms, candy] = await Promise.all([
        api('torn/gyms', {}, { ttl: 86400, persist: true }),
        api('torn/items', { cat: 'Candy' }, { ttl: 3600, persist: true }),
      ]);
      gymState.me = me;
      gymState.gyms = gyms.gyms || [];
      gymState.candy = candyOptions(candy.items);
      if (gymInputs.energy == null) gymInputs.energy = me.bars.energy.current;
      if (gymInputs.happy == null) gymInputs.happy = me.bars.happy.current;
      if (gymInputs.candyId == null && gymState.candy[0]) gymInputs.candyId = gymState.candy[0].id;
    } catch (e) { gymState.error = e; }
    gymState.loaded = true;
    if (settings.ratio) watchGymPage();
    if (activeTab === 'gym') renderActive();
  }

  // ---- Gym page: the fill button (the player still clicks Train) -------------
  const STAT_LABEL = { strength: 'Strength', speed: 'Speed', dexterity: 'Dexterity', defense: 'Defense' };

  /**
   * Find each stat's train box on Torn's gym page by its visible label and its
   * Train button, so it doesn't depend on Torn's internal class names.
   */
  function findGymBoxes() {
    const found = {};
    for (const input of document.querySelectorAll('input')) {
      if (input.closest('.tt-root') || !['text', 'number', 'tel', ''].includes(input.type)) continue;
      let node = input.parentElement;
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
        // textContent joins neighbouring elements without spaces ("STRENGTHStrengthTRAIN"),
        // so match plain text, not whole words. A box must name exactly one stat.
        const text = (node.textContent || '').toLowerCase();
        const names = STATS.filter((s) => text.includes(s));
        if (names.length > 1) break;
        const hasTrain = [...node.querySelectorAll('button')].some((b) => /train/i.test(b.textContent || '') && !b.closest('.tt-root') && !b.classList.contains('tt-fill-btn'));
        if (names.length === 1 && hasTrain) { if (!found[names[0]]) found[names[0]] = { input, block: node }; break; }
      }
    }
    return found;
  }

  /** Put a number in Torn's input the way typing would, so the page's own code sees it. */
  function fillInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  function placeFillButton(rec) {
    document.querySelectorAll('.tt-fill-btn').forEach((b) => b.remove());
    if (!settings.ratioOnPage || !rec || !rec.trains) return false;
    const box = findGymBoxes()[rec.stat];
    if (!box) return false;
    const btn = h('button', {
      class: 'tt-fill-btn', type: 'button', title: 'Torn Toolkit: fills the number in. You still press Train yourself.',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); fillInput(box.input, rec.trains); },
    }, `Fill ${rec.trains} (ratio)`);
    box.block.append(btn);
    return true;
  }

  let gymWatchStarted = false;
  function watchGymPage() {
    if (gymWatchStarted) return;
    gymWatchStarted = true;
    // Only observe the player's own Train clicks, then refresh stats so the next suggestion is right.
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b || b.closest('.tt-root') || b.classList.contains('tt-fill-btn') || !/train/i.test(b.textContent || '')) return;
      setTimeout(() => refreshGymStats(), 2500);
    }, true);
    // The gym page redraws itself; put the button back when it does.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        if (gymState.rec && !document.querySelector('.tt-fill-btn')) placeFillButton(gymState.rec);
      }, 500);
    }).observe(document.body, { childList: true, subtree: true });
  }

  async function refreshGymStats() {
    try {
      // `timestamp` makes the request unique so Torn's 30-second service cache is skipped (allowed by the API docs).
      const sel = gymState.limited ? 'bars,cooldowns,battlestats,gym' : 'bars,cooldowns,gym';
      const me = await api('user', { selections: sel, timestamp: String(Math.floor(Date.now() / 1000)) }, { ttl: 0 });
      gymState.me = me;
      gymInputs.energy = me.bars.energy.current;
      gymInputs.happy = me.bars.happy.current;
      if (gymState.limited && me.battlestats) gymInputs.statValue = me.battlestats[gymInputs.statType].value;
    } catch (e) { /* keep the last stats; errors show on the next load */ }
    if (activeTab === 'gym') renderActive();
  }

  function renderRatio(el, me, gym) {
    const section = h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' }, 'Training ratio'));
    el.append(section);
    if (!gymState.limited || !me.battlestats) {
      section.append(notice('Ratio guidance needs your battle stats, which need a Limited Access key.', 'warn'));
      return;
    }
    const stats = {};
    STATS.forEach((s) => { stats[s] = me.battlestats[s].value; });

    const kindSelect = h('select', { class: 'tt-input', onchange: (e) => { settings.ratioKind = e.target.value; saveSettings(); renderActive(); } },
      Object.entries(RATIOS).map(([k, label]) => h('option', { value: k, selected: settings.ratioKind === k }, label)));
    const mainSelect = h('select', { class: 'tt-input', onchange: (e) => { settings.ratioPrimary = e.target.value; saveSettings(); renderActive(); } },
      STATS.map((s) => h('option', { value: s, selected: settings.ratioPrimary === s }, STAT_LABEL[s])));
    const needsMain = settings.ratioKind === 'hanks' || settings.ratioKind === 'baldrs';
    section.append(h('div', { class: 'tt-grid' + (needsMain ? '' : ' tt-grid-one') },
      h('label', { class: 'tt-field' }, h('span', {}, 'Ratio'), kindSelect),
      needsMain ? h('label', { class: 'tt-field' }, h('span', {}, 'Main stat'), mainSelect) : null));
    if (settings.ratioKind === 'custom') {
      const custom = settings.ratioCustom || [1, 1, 1, 1];
      section.append(h('div', { class: 'tt-grid4' }, STATS.map((s, i) => h('label', { class: 'tt-field' }, h('span', {}, STAT_LABEL[s].slice(0, 3)),
        h('input', { class: 'tt-input', type: 'number', min: '0', step: '0.01', value: custom[i],
          onchange: (e) => { const c = (settings.ratioCustom || [1, 1, 1, 1]).slice(); c[i] = Math.max(0, Number(e.target.value) || 0); settings.ratioCustom = c; saveSettings(); renderActive(); } })))));
    }

    const weights = ratioWeights(settings.ratioKind, settings.ratioPrimary, settings.ratioCustom);
    if (!weights) { section.append(notice('Give at least one stat a value above 0.', 'warn')); gymState.rec = null; placeFillButton(null); return; }
    const protect = ratioGyms(settings.ratioKind, settings.ratioPrimary);
    const rec = recommendTrain({ stats, weights, gym, energy: me.bars.energy.current, happy: me.bars.happy.current, protect });
    gymState.rec = rec;

    const card = h('div', { class: 'tt-result' });
    if (rec.trains > 0) {
      card.append(h('div', { class: 'tt-sub' }, 'Train next'),
        h('div', { class: 'tt-big' }, `${STAT_LABEL[rec.stat]} × ${rec.trains}`),
        h('div', { class: 'tt-sub' }, `${rec.trains * gym.energy_cost}E in ${gym.name} · about +${formatNumber(rec.gain)}`,
          rec.reason === 'limit' ? ` · stops before you lose ${rec.limitedBy}` : '',
          rec.reason === 'energy-cap' ? ' · all your energy' : ''));
      const onPage = placeFillButton(rec);
      card.append(h('div', { class: 'tt-actions', style: 'justify-content:flex-start;margin-top:10px' },
        h('button', { class: 'tt-btn', type: 'button', onclick: () => {
          const box = findGymBoxes()[rec.stat];
          if (box) fillInput(box.input, rec.trains);
          else card.append(notice(`Couldn’t find the ${STAT_LABEL[rec.stat]} box on this page. Type ${rec.trains} there yourself.`, 'warn'));
        } }, `Fill ${rec.trains} into ${STAT_LABEL[rec.stat]}`)),
      h('div', { class: 'tt-sub', style: 'margin-top:6px' }, onPage || !settings.ratioOnPage ? 'Then press Train yourself. The suggestion updates after you train.' : 'Then press Train yourself.'));
    } else if (rec.reason === 'gym') {
      card.append(h('div', { class: 'tt-sub' }, 'Train next'), h('div', { class: 'tt-big' }, STAT_LABEL[rec.stat]),
        h('div', { class: 'tt-sub' }, `${gym.name} can’t train ${STAT_LABEL[rec.stat].toLowerCase()}. Switch to a gym that can.`));
      const alt = recommendTrain({ stats, weights, gym, energy: me.bars.energy.current, happy: me.bars.happy.current, protect, onlyTrainable: true });
      if (alt && alt.trains > 0) {
        gymState.rec = alt;
        placeFillButton(alt);
        card.append(h('div', { class: 'tt-sub', style: 'margin-top:8px' }, `Or, in this gym: ${STAT_LABEL[alt.stat]} × ${alt.trains} (about +${formatNumber(alt.gain)})`),
          h('div', { class: 'tt-actions', style: 'justify-content:flex-start;margin-top:8px' },
            h('button', { class: 'tt-btn tt-btn-ghost', type: 'button', onclick: () => {
              const box = findGymBoxes()[alt.stat];
              if (box) fillInput(box.input, alt.trains);
              else card.append(notice(`Couldn’t find the ${STAT_LABEL[alt.stat]} box on this page. Type ${alt.trains} there yourself.`, 'warn'));
            } }, `Fill ${alt.trains} into ${STAT_LABEL[alt.stat]}`)));
      } else {
        placeFillButton(null);
      }
    } else if (rec.reason === 'blocked') {
      card.append(h('div', { class: 'tt-sub' }, 'Train next'), h('div', { class: 'tt-big' }, STAT_LABEL[rec.stat]),
        h('div', { class: 'tt-err' }, `Even one train would lose ${rec.limitedBy}. Train another stat or adjust your ratio.`));
      placeFillButton(null);
    } else {
      card.append(h('div', { class: 'tt-sub' }, 'Train next'), h('div', { class: 'tt-big' }, STAT_LABEL[rec.stat]),
        h('div', { class: 'tt-sub' }, `Not enough energy for a ${gym.energy_cost}E train here.`));
      placeFillButton(null);
    }
    section.append(card);

    // Current vs target share
    const total = STATS.reduce((a, s) => a + stats[s], 0) || 1;
    const wTotal = STATS.reduce((a, s) => a + weights[s], 0) || 1;
    const table = h('div', { class: 'tt-section' }, h('div', { class: 'tt-row tt-sub' }, h('span', {}, 'Stat'), h('span', {}, 'Now → target')));
    STATS.forEach((s) => {
      const now = (stats[s] / total) * 100, target = (weights[s] / wTotal) * 100;
      table.append(row(h('span', { class: s === rec.stat ? 'tt-strong' : '' }, `${STAT_LABEL[s]} ${formatMoney(stats[s]).slice(1)}`),
        h('span', { class: Math.abs(now - target) < 1 ? 'tt-ok' : '' }, `${now.toFixed(1)}% → ${target.toFixed(1)}%`)));
    });
    section.append(table);

    const reqs = h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' }, 'Specialist gym requirements'));
    gymRequirements(stats).forEach((r) => reqs.append(row(
      h('span', { class: protect.includes(r.name) ? 'tt-strong' : '' }, r.name, protect.includes(r.name) ? h('span', { class: 'tt-tag' }, 'ratio') : null),
      h('span', { class: r.ok ? 'tt-ok' : 'tt-sub' }, `${r.ok ? '✓' : '✗'} ${isFinite(r.ratio) ? r.ratio.toFixed(2) : '–'}×`))));
    reqs.append(h('p', { class: 'tt-sub', style: 'margin:6px 0 0' }, 'Each gym needs 1.25× or more. Single-stat gyms compare the stat with your next highest; pair gyms compare the pair with the other two. “ratio” marks the gyms your ratio keeps. Each gym also has to be unlocked in Torn first.'));
    section.append(reqs);
  }

  views.gym = {
    title: 'Gym',
    render(el) {
      if (gymState.error) { el.append(notice(gymState.error.message, 'err')); return; }
      if (!gymState.loaded) { el.append(h('p', { class: 'tt-sub' }, 'Loading…')); return; }
      const { me, gyms, candy } = gymState;
      const gym = gyms.find((g) => g.id === (me.gym && me.gym.id));
      if (!gym) { el.append(notice('Could not find your active gym.', 'err')); return; }
      if (settings.ratio) renderRatio(el, me, gym);
      else placeFillButton(null);
      if (!settings.jump) { setFoot(gym.name, ''); return; }
      el.append(h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' }, 'Happy / choco jump')));

      const trainable = STATS.filter((s) => gym.modifiers[s] > 0);
      if (!trainable.includes(gymInputs.statType)) gymInputs.statType = trainable[0];
      if (gymInputs.statValue == null && gymState.limited && me.battlestats) {
        gymInputs.statValue = me.battlestats[gymInputs.statType].value;
      }

      const out = h('div', { class: 'tt-result', 'aria-live': 'polite' });
      const num = (v) => Math.max(0, Number(v) || 0);
      const field = (label, input) => h('label', { class: 'tt-field' }, h('span', {}, label), input);
      const input = (key, extra) => h('input', Object.assign({
        class: 'tt-input', type: 'number', min: '0', inputmode: 'numeric', value: gymInputs[key] ?? '',
        oninput: (e) => { gymInputs[key] = e.target.value === '' ? null : num(e.target.value); calc(); },
      }, extra || {}));

      const statSelect = h('select', {
        class: 'tt-input',
        onchange: (e) => {
          gymInputs.statType = e.target.value;
          if (gymState.limited && me.battlestats) gymInputs.statValue = me.battlestats[gymInputs.statType].value;
          renderActive();
        },
      }, trainable.map((s) => h('option', { value: s, selected: s === gymInputs.statType }, `${cap(s)} (${gym.modifiers[s]} dots)`)));

      const candySelect = h('select', {
        class: 'tt-input',
        onchange: (e) => { gymInputs.candyId = Number(e.target.value); calc(); },
      }, candy.map((c) => h('option', { value: c.id, selected: c.id === gymInputs.candyId },
        `${c.name} (+${c.happy}, ${formatMoney(c.price)})`)));

      el.append(h('div', { class: 'tt-section' },
        h('div', { class: 'tt-row' }, h('span', { class: 'tt-strong' }, gym.name), h('span', { class: 'tt-sub' }, `${gym.energy_cost}E per train`)),
        field('Stat', statSelect),
        gymState.limited ? null : notice('Your key is not Limited Access, so enter your stat yourself.', 'warn'),
        h('div', { class: 'tt-grid' },
          field(`Current ${gymInputs.statType}`, input('statValue')),
          field('Energy to spend', input('energy')),
          field('Happy before jump', input('happy')),
          field('Candies to eat', input('candyCount'))),
        candy.length ? field('Candy', candySelect) : null,
        h('label', { class: 'tt-check' },
          h('input', { type: 'checkbox', checked: gymInputs.ecstasy, onchange: (e) => { gymInputs.ecstasy = e.target.checked; calc(); } }),
          'Take Ecstasy after the candy (doubles happy)'),
        out,
        h('p', { class: 'tt-sub', style: 'margin:10px 0 0' }, 'Uses the community gym formula without perks, so treat gains as an estimate.')));

      function calc() {
        const dots = gym.modifiers[gymInputs.statType];
        const stat = num(gymInputs.statValue);
        const energy = num(gymInputs.energy);
        const happy = num(gymInputs.happy);
        const c = candy.find((x) => x.id === gymInputs.candyId);
        const count = Math.floor(num(gymInputs.candyCount));
        const capSec = num(settings.boosterCapHours) * 3600;
        const boosterNow = (me.cooldowns && me.cooldowns.booster) || 0;
        const maxC = c ? maxCandies({ boosterNow, capSeconds: capSec, perCandySeconds: c.boosterSec }) : 0;
        let jumpHappy = happy + (c ? c.happy * count : 0);
        if (gymInputs.ecstasy) jumpHappy *= 2;
        jumpHappy = Math.min(jumpHappy, MAX_HAPPY);

        const base = { stat, energy, gymDots: dots, energyPerTrain: gym.energy_cost, statType: gymInputs.statType };
        const normal = simulateTraining({ ...base, happy });
        const jump = simulateTraining({ ...base, happy: jumpHappy });
        out.replaceChildren(
          row(`Normal (${formatNumber(happy)} happy)`, `+${formatNumber(normal.gain)}`),
          row(`Jump (${formatNumber(jumpHappy)} happy)`, `+${formatNumber(jump.gain)}`, 'tt-ok tt-strong'),
          row('Difference', normal.gain > 0 ? `×${(jump.gain / normal.gain).toFixed(2)}` : '–'),
          row('Trains', `${jump.trains} × ${gym.energy_cost}E`),
          c && count ? row('Candy cost', formatMoney(c.price * count)) : null,
          c && count ? row('Booster cooldown after', formatDuration(boosterNow + count * (c.boosterSec || 0)),
            count > maxC ? 'tt-err' : '') : null,
          c && count > maxC ? notice(`Only about ${maxC} of these fit before your booster cooldown hits ${settings.boosterCapHours}h. Change the cap in settings if yours is higher.`, 'err') : null,
          stat ? null : notice('Enter your current stat to see gains.', 'warn'),
        );
      }
      calc();
      setFoot(gymState.limited ? 'Stats from your key' : 'Stats entered by you', '');
    },
  };

  // ---------------------------------------------------------------- Foreign stock (opt-in, YATA)
  const YATA_URL = 'https://yata.yt/api/v1/travel/export/';
  const stockState = { data: null, error: null };

  /** Download YATA's public stock list (cached 5 minutes, shared by all tabs). */
  function loadForeignStock() {
    if (!settings.foreignStock) return Promise.resolve(null);
    const cached = store.get('yataStock', null);
    if (cached && Date.now() - cached.t < 5 * 60e3) { stockState.data = cached.data; return Promise.resolve(cached.data); }
    if (typeof GM_xmlhttpRequest !== 'function') {
      stockState.error = 'Live stock needs Tampermonkey or Violentmonkey (cross-site requests).';
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET', url: YATA_URL, timeout: 15000, anonymous: true,
        onload: (r) => {
          try {
            if (r.status !== 200) throw new Error('HTTP ' + r.status);
            const data = parseYata(JSON.parse(r.responseText));
            const prev = cached && cached.data;
            store.set('stockHistory', updateStockHistory(store.get('stockHistory', {}), prev, data));
            store.set('yataStock', { t: Date.now(), data });
            stockState.data = data; stockState.error = null;
            resolve(data);
          } catch (e) { stockState.error = 'Could not read live stock from YATA.'; resolve(cached ? cached.data : null); }
        },
        onerror: () => { stockState.error = 'Could not reach YATA for live stock.'; resolve(cached ? cached.data : null); },
        ontimeout: () => { stockState.error = 'YATA took too long to answer.'; resolve(cached ? cached.data : null); },
      });
    });
  }

  // ---------------------------------------------------------------- Travel view
  const travelState = { me: null, items: null, error: null, limited: true, loadedAt: 0, loading: false, showAll: false, open: null };
  const tct = (unixSec) => new Date(unixSec * 1000).toISOString().slice(11, 16) + ' TCT';

  function recordCalibration(travel) {
    const before = store.get('flightCalibration', {});
    const after = calibrate(before, travel);
    if (after !== before) store.set('flightCalibration', after);
  }

  async function loadTravel(force) {
    if (travelState.loading || (!force && Date.now() - travelState.loadedAt < 60000)) return;
    travelState.loading = true;
    travelState.error = null;
    try {
      let me;
      try {
        me = await api('user', { selections: 'bars,travel,travelinventory' }, { ttl: 60 });
        travelState.limited = true;
      } catch (e) {
        if (e.kind !== 'access') throw e;
        me = await api('user', { selections: 'bars,travel' }, { ttl: 60 });
        travelState.limited = false;
      }
      const [items] = await Promise.all([getItemData(), loadForeignStock()]);
      travelState.me = me;
      travelState.items = items.abroad;
      travelState.fetchedAt = Date.now();
      recordCalibration(me.travel);
    } catch (e) { travelState.error = e; }
    travelState.loading = false;
    travelState.loadedAt = Date.now();
    if (activeTab === 'travel') renderActive();
  }

  function travelMethod(me) {
    if (settings.travelMethod && settings.travelMethod !== 'auto') return settings.travelMethod;
    return (me && me.travel && me.travel.method) || 'Standard';
  }
  function travelCapacity(me) {
    if (settings.travelCapacity > 0) return settings.travelCapacity;
    const cap = me && me.travelinventory && me.travelinventory.capacity;
    return cap && cap.base > 0 ? cap.base : 5;
  }

  views.travel = {
    title: 'Travel',
    render(el) {
      loadTravel(false);
      const { me, items, error } = travelState;
      if (error) { el.append(notice(error.message, error.kind === 'backoff' ? 'warn' : 'err')); if (!me) return; }
      if (!me || !items) { el.append(h('p', { class: 'tt-sub' }, 'Loading…')); return; }
      const elapsed = (Date.now() - travelState.fetchedAt) / 1000;
      const nowSec = Date.now() / 1000;
      const tr = me.travel || {};
      const method = travelMethod(me);
      const capacity = travelCapacity(me);
      const calibration = store.get('flightCalibration', {});
      const stock = settings.foreignStock ? stockState.data : null;
      const history = settings.foreignStock ? store.get('stockHistory', {}) : {};
      const budget = Math.max(0, Number(settings.travelBudget) || 0);
      const runs = travelRuns(items, { capacity, method, calibration, stock, budget, top: 5 });
      const inTorn = !tr.destination || tr.destination === 'Torn';
      const flyingLeft = Math.max(0, (tr.time_left || 0) - elapsed);

      const stockLine = (country, it) => {
        if (!stock) return null;
        const rec = history[country] && history[country][it.id];
        const bits = [];
        if (it.qty != null) bits.push(it.qty === 0 ? 'Sold out' : `${formatNumber(it.qty)} in stock`);
        if (rec && rec.emptySince) bits.push(`empty since ${tct(rec.emptySince)}`);
        if (rec && rec.restockAt) bits.push(`restock seen ${tct(rec.restockAt)}`);
        return bits.length ? h('div', { class: 'tt-sub' }, bits.join(' · ')) : null;
      };
      const itemRow = (country, it) => h('div', { class: 'tt-item' },
        h('div', { class: 'tt-row' }, h('span', { class: 'tt-strong' }, it.name),
          h('span', { class: 'tt-value tt-ok' }, `+${formatMoney(it.profit)} each`)),
        h('div', { class: 'tt-row tt-sub' }, h('span', {}, `${formatMoney(it.buy)} → ≈ ${formatMoney(it.market)}`),
          h('span', {}, it.load ? `${it.load}× = +${formatMoney(it.tripProfit)}` : 'sold out')),
        stockLine(country, it));

      if (settings.foreignStock && stockState.error) el.append(notice(stockState.error, 'warn'));

      // Where you are now
      const where = h('div', { class: 'tt-section' });
      if (flyingLeft > 0) {
        where.append(h('div', { class: 'tt-result' },
          h('div', { class: 'tt-sub' }, inTorn ? 'Flying home' : `Flying to ${tr.destination}`),
          h('div', { class: 'tt-big' }, formatDuration(flyingLeft)),
          h('div', { class: 'tt-sub' }, `Lands at ${tct(nowSec + flyingLeft)}`)));
        const dest = !inTorn && runs.find((r) => r.country === tr.destination);
        if (dest && dest.items.length) {
          where.append(h('div', { class: 'tt-section-title', style: 'margin-top:12px' }, `Buy in ${tr.destination}`));
          dest.items.slice(0, 3).forEach((it) => where.append(itemRow(dest.country, it)));
        }
      } else if (!inTorn) {
        const here = runs.find((r) => r.country === tr.destination);
        where.append(h('div', { class: 'tt-section-title' }, `Best buys in ${tr.destination}`));
        if (here && here.items.length) {
          here.items.forEach((it) => where.append(itemRow(here.country, it)));
          where.append(row(`Best load (${here.items[0].load} items)`, `+${formatMoney(here.perTrip)}`, 'tt-ok tt-strong'));
        } else {
          where.append(h('p', { class: 'tt-sub' }, stock ? 'Nothing profitable is in stock here right now.' : 'Nothing here sells for more than it costs at market value.'));
        }
        if (here) where.append(h('div', { class: 'tt-sub', style: 'margin-top:6px' }, `Flight home ${here.measured ? '' : '≈ '}${formatDuration(here.oneWay)}`));
      } else {
        where.append(row('You are', 'In Torn'));
      }
      el.append(where);

      // Options
      const methodSelect = h('select', {
        class: 'tt-input',
        onchange: (e) => { settings.travelMethod = e.target.value; saveSettings(); renderActive(); },
      }, h('option', { value: 'auto', selected: !settings.travelMethod || settings.travelMethod === 'auto' }, `Auto (${METHOD_LABEL[tr.method] || 'Standard'})`),
      Object.keys(METHOD_MULT).map((m) => h('option', { value: m, selected: settings.travelMethod === m }, METHOD_LABEL[m])));
      const capInput = h('input', {
        class: 'tt-input', type: 'number', min: '1', max: '100', inputmode: 'numeric', value: capacity,
        onchange: (e) => { settings.travelCapacity = Math.max(0, Math.floor(Number(e.target.value) || 0)); saveSettings(); renderActive(); },
      });
      const budgetInput = h('input', {
        class: 'tt-input', type: 'text', inputmode: 'numeric', placeholder: 'No limit',
        value: budget ? formatNumber(budget) : '',
        onchange: (e) => { settings.travelBudget = Math.max(0, Number(String(e.target.value).replace(/[^\d]/g, '')) || 0); saveSettings(); renderActive(); },
      });
      el.append(h('div', { class: 'tt-section' }, h('div', { class: 'tt-grid tt-grid-wide' },
        h('label', { class: 'tt-field' }, h('span', {}, 'Travel type'), methodSelect),
        h('label', { class: 'tt-field', title: travelState.limited && !(settings.travelCapacity > 0) ? 'Read from your API key' : 'Set by you' }, h('span', {}, 'Capacity'), capInput)),
      h('label', { class: 'tt-field' }, h('span', {}, 'Most you want to spend per trip ($)'), budgetInput)));

      // Energy regen warning
      const eFull = me.bars && me.bars.energy ? Math.max(0, me.bars.energy.full_time - elapsed) : 0;
      if (flyingLeft === 0 && inTorn && eFull > 0 && runs[0] && eFull < runs[0].roundTrip) {
        el.append(notice(`Your energy is full in ${formatDuration(eFull)}. Use it before a long trip or the extra regen is wasted.`, 'warn'));
      }

      // Ranked trips (click a country for its items)
      const list = h('div', { class: 'tt-section' }, h('div', { class: 'tt-section-title' },
        stock ? 'Best trips per hour · live stock' : 'Best trips per hour'));
      const shown = travelState.showAll ? runs : runs.slice(0, 5);
      for (const r of shown) {
        const best = r.items[0];
        const open = travelState.open === r.country;
        const trip = h('div', { class: 'tt-trip' + (open ? ' tt-open' : '') },
          h('button', { class: 'tt-trip-head', type: 'button', 'aria-expanded': String(open),
            onclick: () => { travelState.open = open ? null : r.country; renderActive(); } },
          h('div', { class: 'tt-row' },
            h('span', { class: 'tt-strong' }, r.country),
            h('span', { class: 'tt-value ' + (r.perHour > 0 ? 'tt-ok' : '') }, r.perHour > 0 ? `${formatMoney(r.perHour)}/h` : '–')),
          h('div', { class: 'tt-row tt-sub' },
            h('span', {}, best ? `${best.load}× ${best.name}` : (stock ? 'Nothing profitable in stock' : 'No profitable items')),
            h('span', {}, best ? `+${formatMoney(r.perTrip)} a trip` : '')),
          h('div', { class: 'tt-row tt-sub' },
            h('span', {}, `${r.measured ? '' : '≈ '}${formatDuration(r.oneWay)} each way`),
            h('span', {}, flyingLeft === 0 && inTorn ? `back ${tct(nowSec + r.roundTrip)}` : (best ? `costs ${formatMoney(r.cost)}` : '')))));
        if (open) {
          const details = h('div', { class: 'tt-details' });
          r.items.forEach((it) => details.append(itemRow(r.country, it)));
          r.soldOut.forEach((it) => details.append(itemRow(r.country, it)));
          if (!r.items.length && !r.soldOut.length) details.append(h('p', { class: 'tt-sub' }, 'No items here resell for a profit.'));
          if (r.stockUpdate) details.append(h('div', { class: 'tt-sub', style: 'margin-top:6px' }, `Stock reported ${formatDuration(nowSec - r.stockUpdate)} ago`));
          trip.append(details);
        }
        list.append(trip);
      }
      if (runs.length > 5) {
        list.append(h('button', { class: 'tt-btn tt-btn-ghost', type: 'button', style: 'width:100%;margin-top:8px',
          onclick: () => { travelState.showAll = !travelState.showAll; renderActive(); } },
        travelState.showAll ? 'Show fewer' : `Show all ${runs.length} countries`));
      }
      el.append(list);
      el.append(h('p', { class: 'tt-sub', style: 'margin:10px 0 0' },
        (stock ? 'Live stock from YATA, reported by players; it can change before you land. Restocks are ones this script has seen itself. ' : 'Turn on live stock in settings to see what is on the shelves. ') +
        'Profit assumes you resell at market value; items with under a 5% margin are skipped as too thin to trust. Times marked ≈ come from the standard table (±3%); the script learns your real times as you fly. Ticket costs are not included.'));
      setFoot(`${METHOD_LABEL[method]} · ${capacity} items`, stock ? 'Stock every 5 min' : 'Prices hourly');
    },
  };

  // ---------------------------------------------------------------- Market values
  function startMarket() {
    let prices = null;
    const ITEM = /\/images\/items\/(\d+)\//;
    function annotate() {
      if (!prices) return;
      document.querySelectorAll('img[src*="/images/items/"]:not([data-tt-mv])').forEach((img) => {
        img.setAttribute('data-tt-mv', '');
        if (img.closest('.tt-root')) return;
        const m = (img.getAttribute('src') || '').match(ITEM);
        const it = m && prices[m[1]];
        if (!it || !it[1]) return;
        img.insertAdjacentElement('afterend', h('span', { class: 'tt-mv', title: `Market value of ${it[0]}` }, formatMoney(it[1])));
      });
    }
    getItemData().then((d) => {
      prices = d.prices;
      annotate();
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => { queued = false; annotate(); }, 400);
      }).observe(document.body, { childList: true, subtree: true });
    }).catch(() => { /* errors already surface in the dock */ });
  }

  // ---------------------------------------------------------------- Settings
  // Other Torn userscripts may use a .tt-overlay class. Only detect our own settings modal.
  const SETTINGS_OVERLAY_ID = 'fl0w-torn-toolkit-settings-overlay';
  function openSettings() {
    if (document.getElementById(SETTINGS_OVERLAY_ID)) return;
    const keyInput = h('input', {
      class: 'tt-input', type: 'password', autocomplete: 'off', spellcheck: 'false', maxlength: '16',
      placeholder: hasPdaKey ? 'Using your Torn PDA key' : '16-character API key', value: hasPdaKey ? '' : store.get('apiKey', ''), disabled: hasPdaKey,
    });
    const msg = h('div', { 'aria-live': 'polite' });
    const check = (k, label, hint) => h('label', { class: 'tt-check' },
      h('input', { type: 'checkbox', 'data-k': k, checked: !!settings[k] }), h('span', {}, label, hint ? h('span', { class: 'tt-sub' }, ' · ' + hint) : null));
    const capInput = h('input', { class: 'tt-input', type: 'number', min: '1', max: '72', value: settings.boosterCapHours });

    const tos = h('table', { class: 'tt-tos' }, h('tbody', {},
      [['Data storage', 'Only locally, in your browser. Game data is cached for 1 minute to 24 hours'],
        ['Data sharing', 'Nobody. Live foreign stock downloads YATA’s public list and sends nothing to it'],
        ['Purpose of use', 'Not eligible – only you see the data'],
        ['Key storage & sharing', 'Stored locally / not shared. Sent only to api.torn.com'],
        ['Key access level', 'Limited Access. Minimal also works; you then type in your battle stats and travel capacity yourself'],
      ].map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))));

    const close = () => overlay.remove();
    const save = async () => {
      const key = keyInput.value.trim();
      if (!hasPdaKey) {
        if (key && !/^[A-Za-z0-9]{16}$/.test(key)) { msg.replaceChildren(notice('An API key is exactly 16 letters and numbers.', 'err')); return; }
        if (key && key !== store.get('apiKey', '')) {
          msg.replaceChildren(notice('Checking key…'));
          try {
            const r = await fetch(API + 'key/info?comment=TornToolkit', { headers: { Authorization: 'ApiKey ' + key } });
            const d = await r.json();
            if (d.error) { msg.replaceChildren(notice(`Torn says: ${d.error.error}`, 'err')); return; }
          } catch (e) { msg.replaceChildren(notice('Could not reach the Torn API to check the key.', 'err')); return; }
          store.set('apiKey', key);
          store.del('keyNotice');
          store.del('backoffUntil');
        }
      }
      overlay.querySelectorAll('[data-k]').forEach((c) => { settings[c.dataset.k] = c.checked; });
      settings.boosterCapHours = Math.min(72, Math.max(1, Number(capInput.value) || 24));
      saveSettings();
      if (settings.notify && !(typeof GM_notification === 'function') && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      location.reload();
    };
    const removeKey = () => { store.del('apiKey'); location.reload(); };

    const modal = h('div', { class: 'tt-root tt-modal' + (document.body.classList.contains('dark-mode') ? ' tt-dark' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Torn Toolkit settings' },
      h('div', { class: 'tt-head' }, h('span', { class: 'tt-title' }, 'Settings'), h('span', { class: 'tt-mini' }, 'v' + VERSION), iconBtn('close', 'Close', close)),
      h('div', { class: 'tt-body', style: 'max-height:none' },
        h('div', { class: 'tt-section' },
          h('div', { class: 'tt-section-title' }, 'API key'),
          keyInput,
          h('div', { class: 'tt-sub', style: 'margin-top:4px' }, 'Create one in Torn → Settings → API Keys. Limited Access is recommended.'),
          msg),
        h('div', { class: 'tt-section' },
          h('div', { class: 'tt-section-title' }, 'Features'),
          check('hud', 'Status panel', 'bars, cooldowns, travel, education'),
          check('market', 'Market values', 'badge next to item images'),
          check('target', 'Target estimate', 'profile and attack pages'),
          check('jump', 'Gym tab', 'gym page: jump planner'),
          check('ratio', 'Training ratio', 'tells you which stat to train next'),
          check('ratioOnPage', 'Fill button on the gym page', 'fills the number; you still press Train'),
          check('travel', 'Travel helper', 'best trips, buys abroad, landing times'),
          check('foreignStock', 'Live foreign stock', 'from YATA'),
          h('div', { class: 'tt-sub', style: 'margin:2px 0 0 23px' },
            'Downloads YATA’s public stock list every 5 minutes. No API key or player data is sent; YATA can see your IP address, like any website. ',
            h('a', { class: 'tt-link', href: 'https://yata.yt/tos', target: '_blank', rel: 'noopener noreferrer' }, 'YATA terms of service')),
          check('notify', 'Notifications', 'bars full, cooldowns over, landed; needs the status panel')),
        h('div', { class: 'tt-section' },
          h('div', { class: 'tt-section-title' }, 'Jump planner'),
          h('label', { class: 'tt-field' }, h('span', {}, 'Booster cooldown limit (hours)'), capInput)),
        h('div', { class: 'tt-section' },
          h('div', { class: 'tt-section-title' }, 'How your key is used'),
          h('div', { class: 'tt-sub' }, 'You keep full control of your data: everything is stored in your browser and your key is sent only to the Torn API. The script is read-only and never performs actions for you.'),
          tos),
        h('div', { class: 'tt-actions' },
          !hasPdaKey && store.get('apiKey', '') ? h('button', { class: 'tt-btn tt-btn-danger', type: 'button', onclick: removeKey }, 'Remove key') : null,
          h('button', { class: 'tt-btn tt-btn-ghost', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'tt-btn', type: 'button', onclick: save }, 'Save'))));

    const overlay = h('div', { id: SETTINGS_OVERLAY_ID, onclick: (e) => { if (e.target === overlay) close(); } }, modal);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(overlay);
    (hasPdaKey ? modal.querySelector('.tt-icon') : keyInput).focus();
  }

  // ---------------------------------------------------------------- boot
  function onContextChange() {
    const previous = ctx;
    ctx = pageContext();
    if (previous.page !== ctx.page || previous.targetId !== ctx.targetId) {
      activeTab = null;
      settings.collapsed = Boolean(getKey()) && !isToolPage(ctx);
    }
    mountInlineDock();
    if (settings.target && ctx.targetId && /^\d+$/.test(ctx.targetId) && ctx.targetId !== targetState.id) loadTarget(ctx.targetId);
    if ((settings.jump || settings.ratio) && ctx.page === 'gym' && !gymState.loaded) loadGym();
    renderTabs();
    applyCollapsed();
  }

  function boot() {
    if (document.getElementById('tt-style')) return; // already running in this page
    buildDock();
    renderTabs();
    renderActive();
    if (!getKey()) return;
    if (settings.hud) {
      refreshStatus();
      setInterval(refreshStatus, 60000);
    }
    let ticks = 0;
    setInterval(() => {
      ticks++;
      if (settings.hud) checkTimers();
      if (settings.collapsed || document.hidden) return;
      // Never re-render under the user's cursor: it would close an open dropdown or reset typing.
      const focused = document.activeElement;
      if (focused && bodyEl.contains(focused) && focused.matches('input,select,textarea')) return;
      if (activeTab === 'status') renderActive();
      else if (activeTab === 'travel' && ticks % 5 === 0) renderActive();
    }, 1000);
    if (settings.market) startMarket();
    onContextChange();
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onContextChange();
      } else if (!dock.isConnected || dock.parentElement !== inlineHost()) {
        // Torn can replace its page container without a full navigation.
        mountInlineDock();
      }
    }, 1000);
  }

  try { boot(); } catch (e) { console.error('[Torn Toolkit]', e); }
})();
