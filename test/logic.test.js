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
