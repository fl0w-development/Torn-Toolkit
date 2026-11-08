const test = require('node:test');
const assert = require('node:assert');
const t = require('../torn-toolkit.user.js');

// Fixtures are real public Torn API v2 / YATA responses (no player data).
const candy = require('./fixtures/candy.json');
const gyms = require('./fixtures/gyms.json');
const abroad = require('./fixtures/items-abroad.json');
const yata = require('./fixtures/yata.json');

// ---------------------------------------------------------------- stat estimate
test('estimateStats: rank list matches the API UserRankEnum (26 ranks)', () => {
  assert.strictEqual(t.RANKS.length, 26);
  assert.strictEqual(t.RANKS[0], 'Absolute beginner');
  assert.strictEqual(t.RANKS[25], 'Invincible');
});

test('estimateStats: v2 rank values ("Novice", no title) work', () => {
  // Novice (4) - level 11 triggers (2,6,11 = 3) - 1 = 0
  assert.strictEqual(t.estimateStats({ rank: 'Novice', level: 11, crimes: 0, networth: 0 }).label, 'under 2k');
});

test('estimateStats: rank above what level/crimes/networth explain means big stats', () => {
  // Invincible (25) - 8 level - 6 crime - 5 networth triggers - 1 = 5
  const r = t.estimateStats({ rank: 'Invincible', level: 100, crimes: 60000, networth: 6e10 });
  assert.strictEqual(r.bracket, 5);
});

test('estimateStats: longest rank wins ("Highly competent" over "Competent")', () => {
  assert.strictEqual(t.estimateStats({ rank: 'Highly competent', level: 1 }).rankIndex, 10);
});

test('estimateStats: clamps to the top bracket and handles unknown ranks', () => {
  assert.strictEqual(t.estimateStats({ rank: 'Invincible', level: 1, crimes: 0, networth: 0 }).label, 'over 200m');
  assert.strictEqual(t.estimateStats({ rank: '???' }), null);
});

// ---------------------------------------------------------------- gym
test('gainPerTrain grows with happy, stat and dots; zero dots gives zero', () => {
  const base = { stat: 1e6, happy: 5000, gymDots: 5, energyPerTrain: 10, statType: 'strength' };
  const g = t.gainPerTrain(base);
  assert.ok(g > 0);
  assert.ok(t.gainPerTrain({ ...base, happy: 50000 }) > g);
  assert.ok(t.gainPerTrain({ ...base, stat: 2e6 }) > g);
  assert.strictEqual(t.gainPerTrain({ ...base, gymDots: 0 }), 0);
});

test('gainPerTrain: known value for 1M strength, 5000 happy, 7.3 dots, 10E', () => {
  // (1e6*1.2131 + 8*5000^1.05 + (1-(5000/99999)^2)*1600 + 1700) / 200000 * 7.3 * 10
  const g = t.gainPerTrain({ stat: 1e6, happy: 5000, gymDots: 7.3, energyPerTrain: 10, statType: 'strength' });
  assert.ok(Math.abs(g - 466.4) < 1, `got ${g}`);
});

test('simulateTraining: jump beats normal, happy falls by half the energy per train', () => {
  const base = { stat: 1e6, energy: 1000, gymDots: 5, energyPerTrain: 10, statType: 'speed' };
  const normal = t.simulateTraining({ ...base, happy: 5000 });
  const jump = t.simulateTraining({ ...base, happy: 99999 });
  assert.strictEqual(normal.trains, 100);
  assert.ok(jump.gain > normal.gain * 2);
  assert.strictEqual(normal.endHappy, 5000 - 100 * 5);
});

test('gym data from the API uses displayed dots and energy per train', () => {
  const beach = gyms.gyms.find((g) => g.name === 'Beach Bods');
  assert.strictEqual(beach.energy_cost, 5);
  assert.strictEqual(beach.modifiers.strength, 3.2);
  assert.strictEqual(beach.modifiers.dexterity, 0); // cannot train dex here
});

// ---------------------------------------------------------------- ratios
const george = gyms.gyms.find((g) => g.name === "George's");
const unlocked = (stats) => t.gymRequirements(stats).filter((r) => r.ok).map((r) => r.name).sort();
const scaled = (w, k) => Object.fromEntries(Object.entries(w).map(([s, v]) => [s, v * k]));

test("Hank's ratio (dex main) keeps Elites and Frontline Fitness: 3 stats in specialist gyms", () => {
  const w = t.ratioWeights('hanks', 'dexterity');
  assert.strictEqual(w.defense, 0.3); // partner neglected
  assert.deepStrictEqual(unlocked(scaled(w, 1e7)), ['Elites', 'Frontline Fitness']);
});

test("Hank's ratio (strength main) keeps Gym 3000 and Balboas", () => {
  assert.deepStrictEqual(unlocked(scaled(t.ratioWeights('hanks', 'strength'), 1e7)), ['Balboas Gym', 'Gym 3000']);
});

test("Baldr's ratio (dex main) keeps Elites and Balboas: 2 stats in specialist gyms", () => {
  const w = t.ratioWeights('baldrs', 'dexterity');
  assert.deepStrictEqual(unlocked(scaled(w, 1e7)), ['Balboas Gym', 'Elites']);
  assert.strictEqual(w.defense, 1); // the partner is the second highest stat
});

test('every main stat works for both named ratios', () => {
  for (const kind of ['hanks', 'baldrs']) {
    for (const s of ['strength', 'speed', 'defense', 'dexterity']) {
      const u = unlocked(scaled(t.ratioWeights(kind, s), 1e7));
      assert.strictEqual(u.length, 2, `${kind} ${s}: ${u}`);
    }
  }
});

test('gymRequirements uses the 25% rule and the real gym names from the API', () => {
  const names = t.gymRequirements({ strength: 1, speed: 1, defense: 1, dexterity: 1 }).map((r) => r.name);
  const apiNames = gyms.gyms.filter((g) => g.class === 'Specialist').map((g) => g.name);
  names.forEach((n) => assert.ok(apiNames.includes(n), n));
  const r = t.gymRequirements({ strength: 125, speed: 100, defense: 50, dexterity: 50 });
  assert.ok(r.find((x) => x.name === 'Gym 3000').ok); // exactly 1.25x
  assert.ok(!r.find((x) => x.name === 'Total Rebound').ok);
});

test('ratioWeights custom and invalid input', () => {
  // Custom values are in panel order: strength, speed, dexterity, defense.
  assert.deepStrictEqual(t.ratioWeights('custom', null, [3, 2, 1, 2]), { strength: 3, speed: 2, dexterity: 1, defense: 2 });
  assert.strictEqual(t.ratioWeights('custom', null, [0, 0, 0, 0]), null);
  assert.strictEqual(t.ratioWeights('hanks', 'luck'), null);
});

test('recommendTrain picks the stat furthest behind and stops when it catches up', () => {
  const stats = { strength: 100000, speed: 100000, defense: 100000, dexterity: 90000 };
  const r = t.recommendTrain({ stats, weights: t.ratioWeights('balanced'), gym: george, energy: 100000, happy: 5000 });
  assert.strictEqual(r.stat, 'dexterity');
  assert.strictEqual(r.reason, 'caughtUp');
  assert.ok(r.trains >= 1 && r.trains < 10000);
  assert.ok(stats.dexterity + r.gain >= 100000);
});

test('recommendTrain is capped by energy and handles gyms that cannot train the stat', () => {
  const stats = { strength: 1e6, speed: 1e6, defense: 1e6, dexterity: 1 };
  const capped = t.recommendTrain({ stats, weights: t.ratioWeights('balanced'), gym: george, energy: 25, happy: 5000 });
  assert.strictEqual(capped.trains, 2); // 25E / 10E per train
  const noE = t.recommendTrain({ stats, weights: t.ratioWeights('balanced'), gym: george, energy: 5, happy: 5000 });
  assert.strictEqual(noE.reason, 'energy');
  const elites = gyms.gyms.find((g) => g.name === 'Elites');
  const wrongGym = t.recommendTrain({ stats: { ...stats, dexterity: 1e6, strength: 1 }, weights: t.ratioWeights('balanced'), gym: elites, energy: 500, happy: 5000 });
  assert.deepStrictEqual([wrongGym.stat, wrongGym.reason], ['strength', 'gym']);
});

test('recommendTrain never trains past a specialist gym requirement you currently meet', () => {
  // Elites is met (dex 1.2625x the next stat). Strength is furthest behind its custom target;
  // training it past ~808k would make dex less than 1.25x strength.
  const stats = { strength: 790000, speed: 800000, defense: 800000, dexterity: 1010000 };
  const weights = t.ratioWeights('custom', null, [2, 1, 1.3, 1]);
  const r = t.recommendTrain({ stats, weights, gym: george, energy: 100000, happy: 5000, protect: ['Elites'] });
  assert.strictEqual(r.stat, 'strength');
  assert.ok(stats.strength + r.gain <= 1010000 / 1.25);
  assert.ok(['blocked', 'limit'].includes(r.reason), r.reason);
  assert.strictEqual(r.limitedBy, 'Elites');
});

// ---------------------------------------------------------------- candy
test('parseHappy / parseBoosterSeconds read real effect text', () => {
  const e = 'Increases happiness by 25 and booster cooldown by 30 minutes.';
  assert.strictEqual(t.parseHappy(e), 25);
  assert.strictEqual(t.parseBoosterSeconds(e), 1800);
  assert.strictEqual(t.parseHappy('Heals you'), null);
  assert.strictEqual(t.parseBoosterSeconds('Increases booster cooldown by 2 hours'), 7200);
});

test('candyOptions parses every real candy and sorts by price per happy', () => {
  const opts = t.candyOptions(candy.items);
  assert.ok(opts.length >= 10);
  opts.forEach((o) => { assert.ok(o.happy > 0); assert.ok(o.boosterSec > 0); });
  for (let i = 1; i < opts.length; i++) assert.ok(opts[i - 1].perHappy <= opts[i].perHappy);
});

test('maxCandies respects the booster cooldown cap', () => {
  assert.strictEqual(t.maxCandies({ boosterNow: 0, capSeconds: 24 * 3600, perCandySeconds: 1800 }), 48);
  assert.strictEqual(t.maxCandies({ boosterNow: 23 * 3600, capSeconds: 24 * 3600, perCandySeconds: 1800 }), 2);
  assert.strictEqual(t.maxCandies({ boosterNow: 30 * 3600, capSeconds: 24 * 3600, perCandySeconds: 1800 }), 0);
});

// ---------------------------------------------------------------- API rules
test('classifyError: invalid/disabled keys are removed (Torn API rule)', () => {
  for (const code of [2, 10, 13, 18]) assert.strictEqual(t.classifyError(code).action, 'removeKey');
  assert.strictEqual(t.classifyError(16).action, 'accessLevel');
  assert.deepStrictEqual(t.classifyError(5), { action: 'backoff', seconds: 60 });
  assert.strictEqual(t.classifyError(8).seconds, 300);
  assert.strictEqual(t.classifyError(17).action, 'backoff');
});

// ---------------------------------------------------------------- notifications
test('updateTimers: no alert on first load for things already ready', () => {
  const r = t.updateTimers({}, [{ id: 'drug', secondsLeft: 0 }], 1000);
  assert.deepStrictEqual(r.fire, []);
});

test('updateTimers: fires once when a countdown finishes', () => {
  let s = t.updateTimers({}, [{ id: 'drug', secondsLeft: 60 }], 1000);
  assert.deepStrictEqual(s.fire, []);
  s = t.updateTimers(s.armed, [{ id: 'drug', secondsLeft: 0 }], 1060);
  assert.strictEqual(s.fire.length, 1);
  s = t.updateTimers(s.armed, [{ id: 'drug', secondsLeft: 0 }], 1061);
  assert.strictEqual(s.fire.length, 0);
});

test('updateTimers: forgets timers that disappear (e.g. flight data gone)', () => {
  const s = t.updateTimers({ travel: 5000 }, [], 1000);
  assert.deepStrictEqual(s.armed, {});
});

// ---------------------------------------------------------------- travel
test('flight table covers every API country except Torn', () => {
  const countries = ['Mexico', 'Hawaii', 'South Africa', 'Japan', 'China', 'Argentina', 'Switzerland', 'Canada', 'United Kingdom', 'UAE', 'Cayman Islands'];
  countries.forEach((c) => assert.ok(t.FLIGHT_MINUTES[c] > 0, c));
  assert.deepStrictEqual(Object.keys(t.METHOD_MULT).sort(), ['Airstrip', 'Business', 'Private', 'Standard']);
});

test('flightSeconds matches published times (airstrip SA 3h17, WLT Mexico ~12m)', () => {
  assert.strictEqual(t.formatDuration(t.flightSeconds('South Africa', 'Airstrip').seconds), '3h 16m');
  assert.ok(Math.abs(t.flightSeconds('Mexico', 'Private').seconds - 750) < 1);
  assert.strictEqual(t.flightSeconds('Mexico', 'Standard').measured, false);
});

test('calibrate stores real outbound flight times and prefers them', () => {
  const travel = { destination: 'Mexico', method: 'Airstrip', departed_at: 1000, arrival_at: 2060, time_left: 0 };
  const c = t.calibrate({}, travel);
  assert.strictEqual(c.Mexico.Airstrip, 1060);
  assert.deepStrictEqual(t.flightSeconds('Mexico', 'Airstrip', c), { seconds: 1060, measured: true });
  // Flights home ("Torn") and never-flown players are ignored.
  assert.deepStrictEqual(t.calibrate({}, { ...travel, destination: 'Torn' }), {});
  assert.deepStrictEqual(t.calibrate({}, { destination: 'Torn', method: null, departed_at: null, arrival_at: null }), {});
});

test('travelRuns: ranks all 11 countries by profit per hour from real items', () => {
  const runs = t.travelRuns(abroad.items, { capacity: 10, method: 'Standard', calibration: {} });
  assert.strictEqual(runs.length, 11);
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i - 1].perHour >= runs[i].perHour);
  const mex = runs.find((r) => r.country === 'Mexico');
  assert.ok(mex.items.length > 0);
  mex.items.forEach((it) => assert.ok(it.profit > 0 && it.load === 10));
  assert.strictEqual(mex.perTrip, mex.items[0].profit * 10);
});

const shopItem = (id, name, buy, market) => ({ id, name, type: 'Other',
  value: { market_price: market, shops: [{ country: 'Mexico', shop: 'General Store', buy_price: buy, sell_price: null }] } });

test('travelRuns skips thin margins (under 5%) that market value cannot back up', () => {
  const items = [shopItem(1, 'Rifle', 20000000, 20256996), shopItem(2, 'Plushie', 10000, 13697)];
  const mex = t.travelRuns(items, { capacity: 10, method: 'Standard', calibration: {} }).find((r) => r.country === 'Mexico');
  assert.deepStrictEqual(mex.items.map((i) => i.name), ['Plushie']);
});

test('travelRuns respects a spending limit per trip', () => {
  const items = [shopItem(1, 'Pricey', 1000000, 2000000), shopItem(2, 'Cheap', 1000, 50000)];
  const mex = t.travelRuns(items, { capacity: 10, method: 'Standard', calibration: {}, budget: 2500000 }).find((r) => r.country === 'Mexico');
  const pricey = mex.items.find((i) => i.name === 'Pricey');
  assert.strictEqual(pricey.load, 2); // only 2 fit in $2.5m
  assert.ok(mex.cost <= 2500000);
  // Nothing affordable at all -> no suggestion.
  const broke = t.travelRuns(items, { capacity: 10, method: 'Standard', calibration: {}, budget: 500 }).find((r) => r.country === 'Mexico');
  assert.strictEqual(broke.items.length, 0);
});

test('parseYata maps codes to Torn country names', () => {
  const s = t.parseYata(yata);
  assert.deepStrictEqual(Object.keys(s).sort(), ['Mexico', 'South Africa', 'Switzerland']);
  const m = s.Mexico;
  assert.ok(m.update > 0);
  const first = yata.stocks.mex.stocks[0];
  assert.strictEqual(m.items[first.id].qty, first.quantity);
  assert.deepStrictEqual(t.parseYata(null), {});
});

test('travelRuns with live stock limits the load to what is on the shelf', () => {
  const stock = { Mexico: { update: 1, items: {} } };
  const items = [{ id: 1, name: 'A', type: 'Plushie', value: { market_price: 1000, shops: [{ country: 'Mexico', shop: 'General Store', buy_price: 100, sell_price: null }] } },
    { id: 2, name: 'B', type: 'Flower', value: { market_price: 500, shops: [{ country: 'Mexico', shop: 'General Store', buy_price: 100, sell_price: null }] } }];
  stock.Mexico.items = { 1: { qty: 0 }, 2: { qty: 3 } };
  const mex = t.travelRuns(items, { capacity: 10, method: 'Standard', calibration: {}, stock }).find((r) => r.country === 'Mexico');
  assert.strictEqual(mex.items[0].name, 'B'); // A is sold out
  assert.strictEqual(mex.items[0].load, 3);
  assert.strictEqual(mex.perTrip, 400 * 3);
  assert.strictEqual(mex.soldOut[0].name, 'A');
});

test('updateStockHistory records restocks and empty shelves it has seen', () => {
  const prev = { Mexico: { update: 100, items: { 1: { qty: 0 }, 2: { qty: 5 } } } };
  const next = { Mexico: { update: 200, items: { 1: { qty: 40 }, 2: { qty: 0 } } } };
  const h = t.updateStockHistory({}, prev, next);
  assert.strictEqual(h.Mexico[1].restockAt, 200);
  assert.strictEqual(h.Mexico[2].emptySince, 200);
  // Same snapshot again changes nothing.
  assert.deepStrictEqual(t.updateStockHistory(h, next, next), h);
  // No previous snapshot: nothing recorded yet.
  assert.deepStrictEqual(t.updateStockHistory({}, null, next), {});
});

// ---------------------------------------------------------------- formatting
test('formatters', () => {
  assert.strictEqual(t.formatDuration(0), '0s');
  assert.strictEqual(t.formatDuration(3725), '1h 02m');
  assert.strictEqual(t.formatDuration(90061), '1d 1h');
  assert.strictEqual(t.formatMoney(1234567), '$1.23m');
  assert.strictEqual(t.formatMoney(25000000), '$25m');
  assert.strictEqual(t.formatMoney(950), '$950');
  assert.strictEqual(t.formatMoney(378736601945), '$379b');
  assert.strictEqual(t.formatMoney(null), '–');
  assert.strictEqual(t.formatNumber(1234567.4), '1,234,567');
});

test('recommendTrain onlyTrainable falls back to the most-behind stat the gym can train', () => {
  const beach = gyms.gyms.find((g) => g.name === 'Beach Bods'); // no dexterity
  const stats = { strength: 278, speed: 177, dexterity: 122, defense: 155 };
  const w = t.ratioWeights('balanced');
  assert.strictEqual(t.recommendTrain({ stats, weights: w, gym: beach, energy: 50, happy: 5000 }).reason, 'gym');
  const alt = t.recommendTrain({ stats, weights: w, gym: beach, energy: 50, happy: 5000, onlyTrainable: true });
  assert.strictEqual(alt.stat, 'defense');
  assert.ok(alt.trains >= 1 && alt.trains <= 10);
});

test('ratioGyms: the gyms each named ratio relies on', () => {
  assert.deepStrictEqual(t.ratioGyms('hanks', 'dexterity'), ['Elites', 'Frontline Fitness']);
  assert.deepStrictEqual(t.ratioGyms('hanks', 'strength'), ['Gym 3000', 'Balboas Gym']);
  assert.deepStrictEqual(t.ratioGyms('baldrs', 'dexterity'), ['Elites', 'Balboas Gym']);
  assert.deepStrictEqual(t.ratioGyms('balanced', 'dexterity'), []);
  // Each named ratio's own targets satisfy exactly the gyms it protects.
  for (const kind of ['hanks', 'baldrs']) for (const s of ['strength', 'speed', 'defense', 'dexterity']) {
    assert.deepStrictEqual(unlocked(scaled(t.ratioWeights(kind, s), 1e7)), t.ratioGyms(kind, s).slice().sort(), kind + ' ' + s);
  }
});

test('balanced ratio is not blocked by specialist gyms it does not use', () => {
  // Frontline is met now, but a balanced build has to give it up.
  const stats = { strength: 1000000, speed: 1000000, defense: 700000, dexterity: 700000 };
  const r = t.recommendTrain({ stats, weights: t.ratioWeights('balanced'), gym: george, energy: 100000, happy: 5000, protect: t.ratioGyms('balanced') });
  assert.ok(r.trains > 0);
  assert.notStrictEqual(r.reason, 'blocked');
});
