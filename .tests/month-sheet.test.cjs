const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function fixture() {
  const d = Data.empty();
  d.groups = [{ id: 'g1', name: 'Cash', assumptions: {} }, { id: 'g2', name: 'Haus', assumptions: {} }];
  d.positions = [
    { id: 'konto', name: 'Tagesgeld', category: 'cash', groupId: 'g1', archived: false, custom: false, ticker: null, unit: null },
    { id: 'haus', name: 'Wohnung', category: 'realEstate', groupId: 'g2', archived: false, custom: false, ticker: null, unit: null }
  ];
  const month = (m, konto) => ({ month: m, positions: [{ positionId: 'konto', value: konto }, { positionId: 'haus', value: 300000 }] });
  d.snapshots = [month('2026-07', 1000), month('2026-08', 1400), month('2026-09', 1850), month('2026-10', 2250), month('2026-11', 2250)];
  d.preferences.onboardingCompleted = true;
  return d;
}
function context(day = '2026-10-08') {
  const storage = new MemoryStorage({ [Data.KEY]: JSON.stringify(fixture()) });
  const a = app(html, storage);
  a.context.CSS = { escape: String };
  a.context.Date = class extends Date { constructor(...v) { super(...(v.length ? v : [day + 'T10:00:00Z'])); } };
  a.run("selectedMonth='2026-11'");
  return a;
}
const input = (a, dataset, value) => { a.context.inp = { dataset, value }; return a.run('_msNum(inp)'); };

test('relative input: „+250“ and „−80“ use the value when the field was tapped; below zero is invalid', () => {
  const a = context();
  assert.equal(input(a, { msVal: 'konto', before: '1000' }, '+250'), 1250);
  assert.equal(input(a, { msVal: 'konto', before: '1000' }, '-80'), 920);
  assert.equal(input(a, { msVal: 'konto', before: '1000' }, '−80'), 920);
  assert.equal(input(a, { msVal: 'konto', before: '1000' }, '1.250,50'), 1250.5);
  assert.ok(Number.isNaN(input(a, { msVal: 'konto', before: '50' }, '-80')));
  assert.equal(input(a, { msQty: 'etf', before: '10' }, '+5'), 15);
  assert.equal(input(a, { msVal: 'konto', orig: '300' }, '+20'), 320, 'falls back to the stored value');
});

test('rarely changed values and suggestions from a steady trend', () => {
  const a = context();
  const keys = ['2026-07', '2026-08', '2026-09', '2026-10'];
  const st = a.json(`_msStableMonths(${JSON.stringify(keys)},loadData(),'haus')`);
  assert.deepEqual(st, { n: 3, since: '2026-07' });
  assert.deepEqual(a.json(`_msStableMonths(${JSON.stringify(keys)},loadData(),'konto')`), { n: 0, since: '2026-10' });
  // Tagesgeld grew by 400, 450, 400 → suggestion +417 for the live month (still equal to October).
  const unchanged = "f=>{const d=loadData();return Math.abs((+d['2026-11']._details[f.id]||0)-(+d['2026-10']._details[f.id]||0))<0.5;}";
  const sugg = a.json(`_msSuggestions(loadData(),'2026-11',_fc.fields.filter(f=>f.id==='konto'),${unchanged})`);
  assert.deepEqual(sugg, { konto: { delta: 417, why: 'Trend' } });
  // Once the live month differs from the previous month, no suggestion is shown.
  a.run("(()=>{const d=loadData();d['2026-11']._details.konto=2600;saveData(d);})()");
  assert.deepEqual(a.json(`_msSuggestions(loadData(),'2026-11',_fc.fields.filter(f=>f.id==='konto'),${unchanged})`), {});
});

test('reminder in the first week of a month until the month is saved', () => {
  const early = context('2026-11-03');
  assert.equal(early.run('_monthDue()'), true);
  early.context.localStorage.setItem('vermoegen-month-done', '2026-12');
  assert.equal(early.run('_monthDue()'), false, 'live month 2026-12 already saved');
  const later = context('2026-11-12');
  assert.equal(later.run('_monthDue()'), false, 'only in the first week');
});

test('saving the live month marks it as done and stays quiet (own confirmation)', () => {
  const a = context();
  a.context.rows = { val: [{ dataset: { msVal: 'konto', kind: 'a', orig: '2250' }, value: '+100' }, { dataset: { msVal: 'haus', kind: 'a', orig: '300000' }, value: '300.000' }], qty: [] };
  a.run("document.querySelectorAll=sel=>sel.includes('data-ms-val')&&sel.includes('data-ms-qty')?rows.val:sel.includes('data-ms-val')?rows.val:[]");
  assert.equal(a.run('_saveMonthSheet()'), 'quiet');
  const snap = a.json('appStorage.document()').snapshots.find(s => s.month === '2026-11');
  assert.equal(snap.positions.find(p => p.positionId === 'konto').value, 2350);
  assert.equal(a.context.localStorage.getItem('vermoegen-month-done'), '2026-11');
});

test('positions with a unit are entered as quantity; unchanged manual values stay exact', () => {
  const a = context();
  // Gold in oz without a price source: 5 oz worth 18.500 € (3.700 €/oz).
  a.run(`(()=>{_fc.fields.push({id:'gold',label:'Gold',category:'metal',hasUnits:true,unitLabel:'oz',unitId:'gold-oz'});saveFieldConfig(_fc);
    const d=loadData();for(const m of Object.keys(d)){d[m]._details.gold=18500.37;d[m]._units=Object.assign(d[m]._units||{},{'gold-oz':5});}saveData(d);_fc=loadFieldConfig();})()`);
  const row = (qty, price) => ({ dataset: { msQty: 'gold', price: String(18500.37 / 5), market: '0', orig: '5', origValue: '18500.37' }, value: qty });
  // Unchanged quantity and price: the stored value stays exactly the same.
  a.context.rows = { qty: [row('5')], val: [] };
  a.run("document.querySelectorAll=sel=>sel.includes('data-ms-qty')?rows.qty:[]");
  a.run('_saveMonthSheet()');
  const snap = m => a.json('appStorage.document()').snapshots.find(s => s.month === m).positions.find(p => p.positionId === 'gold');
  assert.deepEqual([snap('2026-11').value, snap('2026-11').quantity], [18500.37, 5]);
  // One more ounce: value = quantity × price.
  a.context.rows = { qty: [row('+1')], val: [] };
  a.context.rows.qty[0].dataset.before = '5';
  a.run('_saveMonthSheet()');
  assert.deepEqual([snap('2026-11').value, snap('2026-11').quantity], [22200.44, 6]);
});

test('depreciation continues by itself with every new month', () => {
  const a = context();
  a.run(`(()=>{const f=_fc.fields.find(x=>x.id==='haus');f.category='vehicle';f.depreciation={method:'percent',amount:1,interval:'month',startMonth:'2026-07',startValue:30000};saveFieldConfig(_fc);_fc=loadFieldConfig();})()`);
  const val = m => a.json(`loadData()['${m}']._details.haus`);
  assert.equal(val('2026-07'), 30000);
  assert.equal(val('2026-10'), 29108.97);
  assert.equal(val('2026-11'), 28817.88, 'live month: one more month of depreciation');
  // The month change creates the next month; its value is computed, not copied.
  a.context.Date = class extends Date { constructor(...v) { super(...(v.length ? v : ['2026-11-02T10:00:00Z'])); } };
  a.run('ensureNextMonth()');
  assert.equal(val('2026-12'), 28529.7);
});
