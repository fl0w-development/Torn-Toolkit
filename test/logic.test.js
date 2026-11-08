const test = require('node:test');
const assert = require('node:assert');
const t = require('../torn-toolkit.user.js');

test('estimateStats: low rank, new player', () => {
  const r = t.estimateStats({ rank: 'Beginner Civilian', level: 3, crimes: 10, networth: 1e5 });
  assert.strictEqual(r.label, 'under 2k');
});

test('estimateStats: rank above what level/crimes/networth explain means big stats', () => {
  // Invincible (25) - level triggers (8) - crimes (6) - networth (5) - 1 = 5
  const r = t.estimateStats({ rank: 'Invincible Boss', level: 100, crimes: 60000, networth: 6e10 });
  assert.strictEqual(r.label, '20M - 250M');
});

test('estimateStats: prefers longest matching rank ("Highly competent" not "Competent")', () => {
  const r = t.estimateStats({ rank: 'Highly competent Thug', level: 1, crimes: 0, networth: 0 });
  assert.strictEqual(r.rankIndex, 10);
});

test('estimateStats: unknown rank returns null', () => {
  assert.strictEqual(t.estimateStats({ rank: '???' }), null);
});

test('gainPerTrain grows with happy and stat', () => {
  const base = { stat: 1e6, happy: 5000, gymDots: 5, energyPerTrain: 10, statType: 'strength' };
  const g = t.gainPerTrain(base);
  assert.ok(g > 0);
  assert.ok(t.gainPerTrain({ ...base, happy: 50000 }) > g);
  assert.ok(t.gainPerTrain({ ...base, stat: 2e6 }) > g);
});

test('simulateTraining: jump beats normal and happy decreases', () => {
  const base = { stat: 1e6, energy: 1000, gymDots: 5, energyPerTrain: 10, statType: 'speed' };
  const normal = t.simulateTraining({ ...base, happy: 5000 });
  const jump = t.simulateTraining({ ...base, happy: 99999 });
  assert.strictEqual(normal.trains, 100);
  assert.ok(jump.gain > normal.gain * 2);
  assert.strictEqual(normal.endHappy, 5000 - 100 * 5);
});

test('parseHappy reads effect text', () => {
  assert.strictEqual(t.parseHappy('Increases happiness by 35 and reduces booster cooldown'), 35);
  assert.strictEqual(t.parseHappy('+75 happiness'), 75);
  assert.strictEqual(t.parseHappy('Heals you'), null);
});

test('chocoOptions sorts candy by price per happy', () => {
  const items = {
    1: { name: 'Lollipop', type: 'Candy', effect: '+25 happiness', market_value: 5000 },
    2: { name: 'Box of Chocolate Bars', type: 'Candy', effect: '+35 happiness', market_value: 3500 },
    3: { name: 'Knife', type: 'Melee', effect: '', market_value: 100 },
  };
  const r = t.chocoOptions(items);
  assert.deepStrictEqual(r.map((o) => o.id), [2, 1]);
});

test('formatters', () => {
  assert.strictEqual(t.formatDuration(0), 'ready');
  assert.strictEqual(t.formatDuration(3725), '1h 2m');
  assert.strictEqual(t.formatMoney(1234567), '$1.23m');
  assert.strictEqual(t.formatMoney(950), '$950');
});
