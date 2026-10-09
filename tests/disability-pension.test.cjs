const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ≠ ' + b);

test('Erwerbsminderungsrente is stored with the own statutory pension and survives a backup', () => {
  const store = Data.createStore(new MemoryStorage());
  store.setItem('lt-drv', JSON.stringify({ points: 20, salary: 24000, emType: 1, em: 780, emUntil: 2029, emLimit: 45000 }));
  const sp = store.document().retirement.primary.statutoryPension;
  assert.equal(sp.disabilityType, 1);
  assert.equal(sp.disabilityPension, 780);
  assert.equal(sp.disabilityUntilYear, 2029);
  assert.equal(sp.earningsLimit, 45000);
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), store.document());
  assert.deepEqual(JSON.parse(target.getItem('lt-drv')), { points: 20, salary: 24000, emType: 1, em: 780, emUntil: 2029, emLimit: 45000 });
});

test('invalid kinds and EM data on other people are rejected', () => {
  const kind = Data.empty(); kind.retirement.primary.statutoryPension.disabilityType = 3;
  assert.throws(() => Data.validate(kind), /teilweise \(1\) oder voll \(2\)/);
  const partner = Data.empty();
  partner.retirement.people.push({ id: 'person-1', name: 'Partner', statutoryPension: { disabilityPension: 900 } });
  assert.throws(() => Data.validate(partner), /gehören zur eigenen Person/);
});

test('EM pension: half of the full pension, earnings limit with 40 % offset, old-age pension at least the full EM pension', () => {
  const a = app(html);
  // Born January 1980: 46,75 years old in October 2026, Regelalter 67.
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','67');");
  const calc = d => a.json(`calcDrvPension(getLifetimeSettings(),Object.assign(getDrv(),${JSON.stringify(d)}))`);
  const part = calc({ points: 10, salary: 30000, emType: 1, em: 800 });
  assert.equal(part.em.amount, 800);
  assert.equal(part.em.until, 67);
  assert.equal(part.em.full, 1600);
  assert.equal(part.netto, Math.max(part.calcNetto, 1600));
  const full = calc({ points: 10, salary: 25000, emType: 2, em: 1200 });
  near(full.em.over, 25000 - 20763.75);
  near(full.em.amount, 1200 - 0.4 * (25000 - 20763.75) / 12);
  assert.equal(calc({ salary: 50000, emType: 1, em: 800, emLimit: 52000 }).em.cut, 0);
  // Ends after 2030 (age 51): no guaranteed minimum for the later old-age pension.
  const ends = calc({ points: 10, emType: 2, em: 1200, emUntil: 2030 });
  near(ends.em.until, 51);
  assert.equal(ends.em.full, 0);
  assert.equal(ends.netto, ends.calcNetto);
  assert.equal(calc({ points: 10 }).em, undefined);
});

test('forecast: the EM pension covers retirement needs only until the old-age pension; partners do not inherit it', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{salary:20000,emType:1,em:700})));");
  const plan = a.json('(()=>{const p=buildPlan();return{em:p.pensions.find(x=>x.from===0),drv:p.drv,extra:p.drvExtra};})()');
  assert.equal(plan.em.amount, 700);
  assert.equal(plan.em.until, plan.drv.age);
  assert.ok(plan.drv.netto >= 1400);
  assert.ok(plan.extra.every(r => r.em === undefined));
  // Early retirement: the EM pension lowers the capital needed until the old-age pension starts.
  const target = () => a.json('(()=>{const p=buildPlan();return targetCapital(p,50,simulatePlan(p,50,{record:true})).target;})()');
  const withEm = target();
  a.run("appStorage.setItem('lt-drv',JSON.stringify((()=>{const d=getDrv();delete d.emType;delete d.em;return d;})()));");
  assert.ok(withEm < target());
});
