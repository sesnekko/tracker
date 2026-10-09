const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8');

test('Beamtenversorgung is stored on the own person and survives backup and restart', () => {
  const storage = new MemoryStorage();
  const store = Data.createStore(storage);
  store.setItem('lt-beamte', JSON.stringify({ pay: 4200, years: 12.5, age: 0, from: 64, deduct: 28 }));
  const doc = store.document();
  assert.equal(doc.schemaVersion, 7);
  assert.deepEqual(doc.retirement.primary.civilServicePension,
    { pensionableSalary: 4200, serviceYears: 12.5, retirementAge: 0, startAge: 64, deductionPercent: 28 });
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), doc);
  assert.deepEqual(JSON.parse(target.getItem('lt-beamte')), { pay: 4200, years: 12.5, age: 0, from: 64, deduct: 28 });
  assert.deepEqual(Data.createStore(storage).document(), doc);
  store.removeItem('lt-beamte');
  assert.equal(own(store.document().retirement.primary, 'civilServicePension'), false);
  assert.equal(store.getItem('lt-beamte'), null);
});

test('version 6 files stay readable; invalid Beamtenversorgung is rejected', () => {
  const v6 = Data.empty(); v6.schemaVersion = 6;
  assert.doesNotThrow(() => Data.validate(v6));
  const unknown = Data.empty(); unknown.retirement.primary.civilServicePension = { salary: 1 };
  assert.throws(() => Data.validate(unknown), /unbekanntes Feld/);
  const text = Data.empty(); text.retirement.primary.civilServicePension = { pensionableSalary: '4000' };
  assert.throws(() => Data.validate(text), /ungültige Zahl/);
  const partner = Data.empty();
  partner.retirement.people.push({ id: 'person-1', name: 'Partner', statutoryPension: {}, civilServicePension: {} });
  assert.throws(() => Data.validate(partner), /unbekanntes Feld/);
});

test('Ruhegehalt: 1,79375 % per year, capped at 71,75 %, minimum 35 % and early-retirement deduction', () => {
  const a = app(html);
  // Born January 1980: 46,75 years old in October 2026, limit 67.
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','67');");
  const calc = b => a.json(`calcBeamtePension(getLifetimeSettings(),Object.assign({},BV_DEFAULTS,${JSON.stringify(b)}))`);
  const full = calc({ pay: 4000, years: 20 });
  assert.equal(full.age, 67);
  assert.equal(full.rate, 71.75);
  assert.equal(full.brutto, 2870);
  assert.equal(full.netto, 2152.5);
  const early = calc({ pay: 4000, years: 20, from: 64 });
  assert.equal(early.age, 64);
  assert.ok(Math.abs(early.total - 37.25) < 1e-9);
  assert.ok(Math.abs(early.cut - 10.8) < 1e-9);
  assert.ok(Math.abs(early.brutto - 4000 * 37.25 * 1.79375 / 100 * 0.892) < 1e-6);
  a.run("appStorage.setItem('lt-save-until','48');");
  assert.ok(calc({ pay: 4000, years: 2 }).rate < 35);
  assert.equal(calc({ pay: 4000, years: 4 }).rate, 35);
  assert.equal(calc({ pay: 0, years: 30 }).netto, 0);
});

test('the pension enters the forecast only while the Altersvorsorge section is on', () => {
  const a = app(html); a.csv(demoCSV);
  const count = () => a.json('buildPlan().pensions.length');
  const before = count();
  a.run("appStorage.setItem('lt-beamte',JSON.stringify({pay:3800,years:15,deduct:25}));");
  const plan = a.json('(()=>{const p=buildPlan();return{n:p.pensions.length,bv:p.bv};})()');
  assert.equal(plan.n, before + 1);
  assert.ok(plan.bv.netto > 0);
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,pension:false,budget:true,forecast:true}));_modsCache=null;");
  assert.equal(a.json('buildPlan().bv.netto'), 0);
});

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
