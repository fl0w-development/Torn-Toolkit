// ==UserScript==
// @name         Torn Toolkit
// @namespace    https://github.com/fl0w-development/Torn-Toolkit
// @downloadURL  https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/fl0w-development/Torn-Toolkit/main/torn-toolkit.user.js
// @version      0.1.0
// @description  Status HUD, market values, target stat estimates and a happy/choco jump planner for Torn. Uses your own API key.
// @author       fl0w-development
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==

/*
 * Rules this script follows (Torn scripting policy):
 *  - Read-only. It never clicks, submits or performs any game action for you.
 *  - Uses only the official API with the player's own key, stored locally.
 *  - Caches every request; stays far below the 100 calls/minute limit.
 */

(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pure logic (no DOM). Exported for tests when run under Node.
  // ---------------------------------------------------------------------------

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
    'under 2k', '2k - 25k', '20k - 250k', '200k - 2.5M',
    '2M - 25M', '20M - 250M', 'over 200M',
  ];

  /**
   * Classic rank-based battle stat estimate. Torn's rank is driven by level,
   * crimes, networth and total battle stats; subtracting the first three
   * leaves a rough stat bracket. Returns null when the rank is unknown.
   */
  function estimateStats({ rank, level, crimes, networth }) {
    const title = String(rank || '').replace(/\s+/g, ' ').trim().toLowerCase();
    // Profile rank looks like "Average Hustler": match the longest known prefix.
    let rankIndex = -1;
    RANKS.forEach((r, i) => {
      if (title.startsWith(r.toLowerCase()) &&
          (rankIndex === -1 || r.length > RANKS[rankIndex].length)) rankIndex = i;
    });
    if (rankIndex === -1) return null;
    const count = (list, v) => list.filter((t) => (v || 0) >= t).length;
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
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  /** Community (Vladar) gym gain formula for a single train. */
  function gainPerTrain({ stat, happy, gymDots, energyPerTrain, statType = 'strength', perks = 1 }) {
    const c = GYM_CONSTANTS[statType];
    if (!c) throw new Error('Unknown stat type: ' + statType);
    const s = Math.min(stat, 50e6);
    const mult = round(1 + 0.07 * round(Math.log(1 + happy / 250), 4), 4);
    return (s * mult + 8 * happy ** 1.05 + (1 - (happy / 99999) ** 2) * c.a + c.b) *
      (1 / 200000) * gymDots * energyPerTrain * perks;
  }

  /**
   * Simulate spending `energy` in the gym, train by train. Happy drops by
   * about half the energy of each train, and the stat compounds.
   */
  function simulateTraining({ stat, happy, energy, gymDots, energyPerTrain, statType, perks }) {
    let s = stat;
    let h = happy;
    const trains = Math.floor(energy / energyPerTrain);
    for (let i = 0; i < trains; i++) {
      s += gainPerTrain({ stat: s, happy: h, gymDots, energyPerTrain, statType, perks });
      h = Math.max(0, h - Math.round(energyPerTrain / 2));
    }
    return { trains, gain: s - stat, endStat: s, endHappy: h };
  }

  /** Pull "+N happiness" out of an item's effect text. */
  function parseHappy(effect) {
    const m = String(effect || '').match(/(\d[\d,]*)\s*happ/i) ||
      String(effect || '').match(/happ\w*\s*(?:by\s*)?\+?(\d[\d,]*)/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  /** Candy items ranked by money per happy point (cheapest first). */
  function chocoOptions(items) {
    return Object.entries(items || {})
      .filter(([, it]) => it.type === 'Candy')
      .map(([id, it]) => ({ id: Number(id), name: it.name, happy: parseHappy(it.effect), price: it.market_value || 0 }))
      .filter((o) => o.happy && o.price)
      .map((o) => ({ ...o, perHappy: o.price / o.happy }))
      .sort((a, b) => a.perHappy - b.perHappy);
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    if (sec === 0) return 'ready';
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
      m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatMoney(n) {
    if (n == null || isNaN(n)) return '?';
    const abs = Math.abs(n);
    const unit = abs >= 1e9 ? [1e9, 'b'] : abs >= 1e6 ? [1e6, 'm'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
    return '$' + round(n / unit[0], unit[0] === 1 ? 0 : 2) + unit[1];
  }

  const logic = { estimateStats, gainPerTrain, simulateTraining, parseHappy, chocoOptions, formatDuration, formatMoney, STAT_RANGES };
  if (typeof module !== 'undefined' && module.exports) { module.exports = logic; return; }

  // ---------------------------------------------------------------------------
  // Browser side
  // ---------------------------------------------------------------------------

  const store = {
    get(k, d) {
      try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : JSON.parse(localStorage.getItem('tt_' + k)) ?? d; }
      catch (e) { return d; }
    },
    set(k, v) {
      try { typeof GM_setValue === 'function' ? GM_setValue(k, v) : localStorage.setItem('tt_' + k, JSON.stringify(v)); }
      catch (e) { /* storage unavailable */ }
    },
  };

  const settings = Object.assign({
    hud: true, market: true, target: true, jump: true, notify: true,
    gymDots: 3.0, energyPerTrain: 10, statType: 'strength',
  }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  // --- API with cache and a simple rate limiter ------------------------------
  const memCache = {};
  const callTimes = [];
  async function api(path, selections, ttlSec) {
    const key = store.get('apiKey', '');
    if (!key) throw new Error('No API key set. Open the Torn Toolkit panel (⚙) to add one.');
    const cacheKey = path + '|' + selections;
    const hit = memCache[cacheKey] || store.get('cache_' + cacheKey, null);
    if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.data;

    const now = Date.now();
    while (callTimes.length && now - callTimes[0] > 60000) callTimes.shift();
    if (callTimes.length >= 50) throw new Error('Torn Toolkit is pausing API calls for a moment (rate limit).');
    callTimes.push(now);

    const url = `https://api.torn.com/${path}?selections=${selections}&key=${encodeURIComponent(key)}&comment=TornToolkit`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Torn API error ${data.error.code}: ${data.error.error}`);
    const entry = { t: Date.now(), data };
    memCache[cacheKey] = entry;
    if (ttlSec >= 600) store.set('cache_' + cacheKey, entry); // persist only slow-changing data
    return data;
  }
  const getItems = () => api('torn/', 'items', 3600).then((d) => d.items);

  // --- Styles ---------------------------------------------------------------
  const css = `
  .tt-panel{position:fixed;z-index:99999;background:#1e1f22;color:#ddd;font:12px/1.4 Arial,sans-serif;
    border:1px solid #444;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.5);min-width:220px;max-width:320px}
  .tt-panel h4{margin:0;padding:6px 8px;background:#2b2d31;border-radius:6px 6px 0 0;font-size:12px;cursor:move;
    display:flex;justify-content:space-between;align-items:center}
  .tt-panel h4 button{background:none;border:0;color:#aaa;cursor:pointer;font-size:13px}
  .tt-body{padding:6px 8px}
  .tt-row{display:flex;justify-content:space-between;gap:8px;padding:1px 0}
  .tt-row .tt-ok{color:#7bd88f}.tt-row .tt-wait{color:#f0b35a}
  .tt-bar{height:4px;background:#333;border-radius:2px;margin:0 0 3px}
  .tt-bar i{display:block;height:100%;border-radius:2px}
  .tt-err{color:#ff7a7a}
  .tt-panel input,.tt-panel select{background:#111;color:#ddd;border:1px solid #444;border-radius:3px;padding:2px 4px;width:100%;box-sizing:border-box}
  .tt-panel label{display:block;margin-top:4px}
  .tt-tabs{display:flex;gap:4px;margin-bottom:6px}.tt-tabs button{flex:1;background:#2b2d31;color:#ccc;border:1px solid #444;border-radius:3px;cursor:pointer;padding:2px}
  .tt-tabs button.on{background:#3d6ea8;color:#fff}
  .tt-mv{display:inline-block;margin-left:4px;padding:0 3px;font:bold 10px Arial;color:#0b3;background:rgba(0,0,0,.6);border-radius:3px;pointer-events:none}
  .tt-small{color:#999;font-size:11px}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function makePanel(id, title, pos) {
    const saved = store.get('pos_' + id, pos);
    const p = el(`<div class="tt-panel" id="tt-${id}"><h4><span>${title}</span><span class="tt-btns">
      <button data-act="min" title="Minimise">–</button></span></h4><div class="tt-body"></div></div>`);
    Object.assign(p.style, { top: saved.top + 'px', left: saved.left + 'px' });
    document.body.appendChild(p);
    const body = p.querySelector('.tt-body');
    if (store.get('min_' + id, false)) body.style.display = 'none';
    p.querySelector('[data-act=min]').onclick = () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      store.set('min_' + id, !hidden);
    };
    // Dragging
    const head = p.querySelector('h4');
    head.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const ox = e.clientX - p.offsetLeft, oy = e.clientY - p.offsetTop;
      const move = (ev) => { p.style.left = ev.clientX - ox + 'px'; p.style.top = ev.clientY - oy + 'px'; };
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        store.set('pos_' + id, { top: p.offsetTop, left: p.offsetLeft });
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    return { panel: p, body, addButton(label, title, fn) {
      const b = el(`<button title="${title}">${label}</button>`); b.onclick = fn;
      p.querySelector('.tt-btns').prepend(b);
    } };
  }

  function notify(title, text) {
    if (!settings.notify) return;
    if (typeof GM_notification === 'function') GM_notification({ title, text, timeout: 8000 });
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text });
  }

  // --- Settings -------------------------------------------------------------
  function openSettings() {
    const existing = document.getElementById('tt-settings');
    if (existing) { existing.remove(); return; }
    const { body } = makePanel('settings', 'Torn Toolkit settings', { top: 120, left: 340 });
    const check = (k, label) => `<label><input type="checkbox" data-k="${k}" ${settings[k] ? 'checked' : ''} style="width:auto"> ${label}</label>`;
    body.innerHTML = `
      <label>API key (Limited access is enough)
        <input type="password" id="tt-key" value="${esc(store.get('apiKey', ''))}" placeholder="16-character key"></label>
      <div class="tt-small">Stored only in your browser. Get one at Settings → API Keys.</div>
      ${check('hud', 'Status HUD')}${check('market', 'Market values on items')}
      ${check('target', 'Target stat estimate')}${check('jump', 'Happy / choco jump planner')}
      ${check('notify', 'Notifications when bars are full / cooldowns end')}
      <label><button id="tt-save" style="width:100%;margin-top:6px">Save &amp; reload</button></label>`;
    body.querySelector('#tt-save').onclick = () => {
      store.set('apiKey', body.querySelector('#tt-key').value.trim());
      body.querySelectorAll('[data-k]').forEach((c) => { settings[c.dataset.k] = c.checked; });
      saveSettings();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      location.reload();
    };
  }

  // --- Module: Status HUD ---------------------------------------------------
  function startHud() {
    const hud = makePanel('hud', 'Torn Toolkit', { top: 80, left: 10 });
    hud.addButton('⚙', 'Settings', openSettings);
    let data = null, fetchedAt = 0, err = null;
    const notified = store.get('notified', {});

    async function refresh() {
      try {
        data = await api('user/', 'bars,cooldowns,travel,education', 30);
        fetchedAt = Date.now(); err = null;
      } catch (e) { err = e.message; }
      render();
    }

    function check(id, secLeft, msg) {
      // Fire once per "event"; keyed on the expected finish time.
      const due = Math.round((fetchedAt / 1000 + secLeft) / 60);
      if (secLeft <= 0 && notified[id] !== due) { notified[id] = due; store.set('notified', notified); notify('Torn', msg); }
    }

    function render() {
      if (err && !data) { hud.body.innerHTML = `<div class="tt-err">${esc(err)}</div>`; return; }
      if (!data) { hud.body.textContent = 'Loading…'; return; }
      const elapsed = (Date.now() - fetchedAt) / 1000;
      const left = (s) => Math.max(0, (s || 0) - elapsed);
      const colors = { energy: '#5cb85c', nerve: '#d9534f', happy: '#f0ad4e', life: '#5bc0de' };
      let html = '';
      for (const b of ['energy', 'nerve', 'happy', 'life']) {
        const bar = data[b]; if (!bar) continue;
        const full = left(bar.fulltime);
        const pct = Math.min(100, (bar.current / bar.maximum) * 100);
        html += `<div class="tt-row"><span>${b[0].toUpperCase() + b.slice(1)} ${bar.current}/${bar.maximum}</span>
          <span class="${full ? 'tt-wait' : 'tt-ok'}">${full ? 'full in ' + formatDuration(full) : 'full'}</span></div>
          <div class="tt-bar"><i style="width:${pct}%;background:${colors[b]}"></i></div>`;
        if (b === 'energy' || b === 'nerve') check(b, full, `${b} is full`);
      }
      const cd = data.cooldowns || {};
      for (const k of ['drug', 'booster', 'medical']) {
        const t = left(cd[k]);
        html += `<div class="tt-row"><span>${k[0].toUpperCase() + k.slice(1)} cooldown</span>
          <span class="${t ? 'tt-wait' : 'tt-ok'}">${formatDuration(t)}</span></div>`;
        check('cd_' + k, t, `${k} cooldown is over`);
      }
      const tr = data.travel;
      if (tr && tr.time_left > 0) {
        const t = left(tr.time_left);
        html += `<div class="tt-row"><span>Travel → ${esc(tr.destination)}</span><span class="${t ? 'tt-wait' : 'tt-ok'}">${t ? formatDuration(t) : 'landed'}</span></div>`;
        check('travel', t, `Landed in ${tr.destination}`);
      }
      if (data.education_current) {
        const t = left(data.education_timeleft);
        html += `<div class="tt-row"><span>Education</span><span class="${t ? 'tt-wait' : 'tt-ok'}">${t ? formatDuration(t) : 'done – start a new course'}</span></div>`;
        check('edu', t, 'Education course finished');
      } else {
        html += `<div class="tt-row"><span>Education</span><span class="tt-wait">no course running</span></div>`;
      }
      if (err) html += `<div class="tt-err tt-small">${esc(err)}</div>`;
      hud.body.innerHTML = html;
    }

    refresh();
    setInterval(refresh, 60000);
    setInterval(render, 1000);
  }

  // --- Module: Market values ------------------------------------------------
  function startMarket() {
    let items = null;
    const ITEM_IMG = /\/images\/items\/(\d+)\//;
    function annotate(rootNode) {
      if (!items) return;
      rootNode.querySelectorAll('img[src*="/images/items/"]:not([data-tt])').forEach((img) => {
        img.dataset.tt = '1';
        const m = img.getAttribute('src').match(ITEM_IMG);
        const it = m && items[m[1]];
        if (!it || !it.market_value) return;
        const badge = el(`<span class="tt-mv" title="Torn Toolkit: market value of ${esc(it.name)}">${formatMoney(it.market_value)}</span>`);
        img.insertAdjacentElement('afterend', badge);
      });
    }
    getItems().then((d) => {
      items = d;
      annotate(document.body);
      let pending = false;
      new MutationObserver(() => {
        if (pending) return; pending = true;
        setTimeout(() => { pending = false; annotate(document.body); }, 500);
      }).observe(document.body, { childList: true, subtree: true });
    }).catch((e) => console.warn('[Torn Toolkit] market:', e.message));
  }

  // --- Module: Target estimator --------------------------------------------
  function targetIdFromUrl() {
    const u = new URL(location.href);
    if (u.pathname === '/profiles.php') return u.searchParams.get('XID');
    if (u.pathname === '/loader.php' && u.searchParams.get('sid') === 'attack') return u.searchParams.get('user2ID');
    return null;
  }

  async function startTarget() {
    const id = targetIdFromUrl();
    if (!id || !/^\d+$/.test(id)) return;
    const card = makePanel('target', 'Target estimate', { top: 80, left: window.innerWidth - 300 });
    card.body.textContent = 'Loading…';
    try {
      const p = await api('user/' + id, 'profile,personalstats', 300);
      const ps = p.personalstats || {};
      const crimes = ps.criminaloffenses || 0;
      const est = estimateStats({ rank: p.rank, level: p.level, crimes, networth: ps.networth });
      const last = p.last_action ? p.last_action.relative : '?';
      card.body.innerHTML = `
        <div class="tt-row"><span>${esc(p.name)} [${id}]</span><span>Lvl ${p.level}</span></div>
        <div class="tt-row"><span>Rank</span><span>${esc(p.rank)}</span></div>
        <div class="tt-row"><span>Est. battle stats</span><b>${est ? est.label : 'unknown'}</b></div>
        <div class="tt-row"><span>Status</span><span>${esc((p.status && p.status.description) || '?')}</span></div>
        <div class="tt-row"><span>Last action</span><span>${esc(last)}</span></div>
        <div class="tt-row"><span>Networth</span><span>${formatMoney(ps.networth)}</span></div>
        <div class="tt-row"><span>Attacks won / lost</span><span>${ps.attackswon ?? '?'} / ${ps.attackslost ?? '?'}</span></div>
        <div class="tt-row"><span>Xanax taken</span><span>${ps.xantaken ?? '?'}</span></div>
        <div class="tt-small">Rank-based estimate: a rough bracket, not exact stats.</div>`;
    } catch (e) { card.body.innerHTML = `<div class="tt-err">${esc(e.message)}</div>`; }
  }

  // --- Module: Happy / choco jump planner ----------------------------------
  function startJump() {
    const u = new URL(location.href);
    if (u.pathname !== '/gym.php') return; // only on the gym page
    const pnl = makePanel('jump', 'Jump planner', { top: 360, left: 10 });
    pnl.body.innerHTML = 'Loading…';
    Promise.all([api('user/', 'bars,battlestats', 30), getItems().catch(() => null)]).then(([me, items]) => {
      const choco = items ? chocoOptions(items) : [];
      const v = (id) => Number(pnl.body.querySelector('#' + id).value) || 0;
      pnl.body.innerHTML = `
        <label>Stat <select id="tt-st">${['strength', 'speed', 'dexterity', 'defense'].map((s) =>
          `<option ${s === settings.statType ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Gym dots (shown on the gym, e.g. 3.0) <input id="tt-gd" type="number" step="0.1" value="${settings.gymDots}"></label>
        <label>Energy per train <input id="tt-ept" type="number" value="${settings.energyPerTrain}"></label>
        <label>Energy to spend <input id="tt-en" type="number" value="${me.energy.current}"></label>
        <label>Current happy <input id="tt-hp" type="number" value="${me.happy.current}"></label>
        <label>Happy from candy (choco jump) <input id="tt-ch" type="number" value="0"></label>
        <label><input type="checkbox" id="tt-ecs" style="width:auto"> Take Ecstasy (doubles happy)</label>
        <div id="tt-out" style="margin-top:6px"></div>
        <div class="tt-small">Gains use the community gym formula, excluding perks: an estimate.</div>`;
      const calc = () => {
        settings.statType = pnl.body.querySelector('#tt-st').value;
        settings.gymDots = v('tt-gd'); settings.energyPerTrain = v('tt-ept') || 10; saveSettings();
        const stat = me[settings.statType] || 0;
        const base = { stat, energy: v('tt-en'), gymDots: settings.gymDots, energyPerTrain: settings.energyPerTrain, statType: settings.statType };
        let jumpHappy = v('tt-hp') + v('tt-ch');
        if (pnl.body.querySelector('#tt-ecs').checked) jumpHappy *= 2;
        const normal = simulateTraining({ ...base, happy: v('tt-hp') });
        const jump = simulateTraining({ ...base, happy: jumpHappy });
        const need = v('tt-ch');
        const best = choco[0];
        pnl.body.querySelector('#tt-out').innerHTML = `
          <div class="tt-row"><span>Current ${settings.statType}</span><span>${Math.round(stat).toLocaleString()}</span></div>
          <div class="tt-row"><span>Normal (${v('tt-hp')} happy)</span><span>+${Math.round(normal.gain).toLocaleString()}</span></div>
          <div class="tt-row"><span>Jump (${jumpHappy} happy)</span><b class="tt-ok">+${Math.round(jump.gain).toLocaleString()}</b></div>
          <div class="tt-row"><span>Extra from jump</span><span>×${normal.gain ? (jump.gain / normal.gain).toFixed(2) : '–'}</span></div>
          ${best && need ? `<div class="tt-row"><span>Cheapest candy</span><span>${esc(best.name)} (+${best.happy})</span></div>
            <div class="tt-row"><span>Candy for +${need}</span><span>${Math.ceil(need / best.happy)} ≈ ${formatMoney(Math.ceil(need / best.happy) * best.price)}</span></div>` : ''}`;
      };
      pnl.body.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', calc));
      calc();
    }).catch((e) => { pnl.body.innerHTML = `<div class="tt-err">${esc(e.message)}</div>`; });
  }

  // --- Boot -----------------------------------------------------------------
  if (!store.get('apiKey', '')) {
    const p = makePanel('hud', 'Torn Toolkit', { top: 80, left: 10 });
    p.addButton('⚙', 'Settings', openSettings);
    p.body.innerHTML = 'Add your API key to get started. <a href="#" id="tt-open">Open settings</a>';
    p.body.querySelector('#tt-open').onclick = (e) => { e.preventDefault(); openSettings(); };
    return;
  }
  const run = (name, fn) => { try { fn(); } catch (e) { console.error('[Torn Toolkit] ' + name, e); } };
  if (settings.hud) run('hud', startHud);
  else run('gear', () => makePanel('hud', 'Torn Toolkit', { top: 80, left: 10 }).addButton('⚙', 'Settings', openSettings));
  if (settings.market) run('market', startMarket);
  if (settings.target) run('target', startTarget);
  if (settings.jump) run('jump', startJump);
})(typeof window !== 'undefined' ? window : globalThis);
