const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);
// Harness date: 2026-10-08. Born 1985 → 41,75 years old, Regelaltersgrenze 67.
const set = (a, values) => a.run(Object.entries(values).map(([k, v]) => `appStorage.setItem('${k}',${JSON.stringify(String(v))});`).join(''));

test('phases follow each other; an empty phase falls away; Rente defaults to the statutory pension', () => {
  const a = app(html);
  set(a, { 'lt-birth-year': 1985, 'lt-save-until': 55, 'lt-withdraw-from': 62 });
  let s = a.json('getLifetimeSettings()');
  assert.deepEqual([s.phase2From, s.workEnd, s.pensionAge, s.phase4From], [55, 62, 67, 67]);
  assert.deepEqual([50, 58, 64, 70].map(age => a.run(`_phaseAt(getLifetimeSettings(),${age})`)), [1, 2, 3, 4]);
  // Saving longer than working: the saving phase ends with work, Weiterarbeiten falls away.
  set(a, { 'lt-save-until': 65 });
  s = a.json('getLifetimeSettings()');
  assert.deepEqual([s.phase2From, s.workEnd], [62, 62]);
  // A pension age before the end of work: no Vorruhestand, Rente starts with the end of work.
  set(a, { 'lt-pension-age': 60 });
  assert.equal(a.json('getLifetimeSettings()').phase4From, 62);
  // Without an own value the Rente follows a configured statutory pension start.
  a.run("appStorage.removeItem('lt-pension-age');appStorage.setItem('lt-drv',JSON.stringify({age:65}));");
  assert.equal(a.json('getLifetimeSettings()').pensionAge, 65);
  // Without separate values: no part-time, no saving in phase 2, the same need in both phases.
  s = a.json('getLifetimeSettings()');
  assert.deepEqual([s.p2Work, s.p2Saving, s.p2Withdraw, s.pensionSpending], [1, 0, 0, s.monthlyWithdraw]);
});

test('pension points and service years: full until the saving phase ends, then in proportion to working time', () => {
  const a = app(html);
  set(a, { 'lt-birth-year': 1985, 'lt-save-until': 55, 'lt-withdraw-from': 62, 'lt-p2-work': 50 });
  // Salary = average salary → exactly 1 point per full year.
  const drv = r => a.json(`calcDrvPension(getLifetimeSettings(),Object.assign({},DRV_DEFAULTS,{points:10,salary:DRV_DEFAULTS.de}))`);
  let r = drv();
  near(r.years, (55 - 41.75) + 7 * 0.5);
  near(r.epTotal, 10 + 13.25 + 3.5);
  set(a, { 'lt-p2-work': 100 });
  near(drv().years, 62 - 41.75);
  // No points after the end of work, even if the pension starts later.
  set(a, { 'lt-p2-work': 0 });
  near(drv().years, 55 - 41.75);
  // Civil servants: part-time counts in proportion to the service time.
  set(a, { 'lt-p2-work': 60 });
  const bv = a.json(`calcBeamtePension(getLifetimeSettings(),Object.assign({},BV_DEFAULTS,{pay:4000,years:10}))`);
  near(bv.years, 13.25 + 7 * 0.6);
  assert.equal(bv.age, 67);
  // Altersvorsorgedepot contributions follow the phases: full while working, then the Vorruhestand share (default none).
  const factor = y => a.run(`_avdParams(getLifetimeSettings(),{contrib:100}).factor(${y})`);
  assert.deepEqual([factor(2030), factor(2046), factor(2047)], [1, 1, 0]);
  set(a, { 'lt-p2-pension': 50, 'lt-p3-pension': 25 });
  assert.deepEqual([factor(2041), factor(2047)], [0.5, 0.25]);
});

test('simulation: phase 2 keeps the bAV by the pension share, private saving by its own share, and may draw on assets', () => {
  const a = app(html); a.csv(demoCSV);
  set(a, { 'lt-birth-year': 1985, 'lt-save-until': 50, 'lt-withdraw-from': 60, 'lt-inflation': 0 });
  const at60 = () => a.json('(()=>{const p=buildPlan();const d=simulatePlan(p,p.s.withdrawFrom,{record:true});const y=60-p.firstAge;const b=p.groups.findIndex(g=>g.cat==="bav");return{total:d.total[y],bav:b<0?null:d.per[b][y],short:d.shortfallAge};})()');
  const none = at60();
  set(a, { 'lt-p2-saving': 100 });
  const saving = at60();
  assert.ok(saving.total > none.total, 'saving in phase 2 builds more wealth');
  set(a, { 'lt-p2-saving': 0, 'lt-p2-withdraw': 1000 });
  const drawing = at60();
  assert.ok(drawing.total < none.total, 'a withdrawal in phase 2 reduces wealth');
  set(a, { 'lt-p2-withdraw': 0, 'lt-p2-pension': 0 });
  const stopped = at60();
  if (none.bav !== null) assert.ok(stopped.bav < none.bav, 'the bAV stops growing without pension contributions');
});

test('Vorruhestand and Rente each use their own need', () => {
  const a = app(html); a.csv(demoCSV);
  set(a, { 'lt-birth-year': 1985, 'lt-save-until': 55, 'lt-withdraw-from': 60, 'lt-pension-age': 67, 'lt-monthly-withdraw': 3000 });
  const target = () => a.json('(()=>{const p=buildPlan();return targetCapital(p,p.s.withdrawFrom,simulatePlan(p,p.s.withdrawFrom,{record:true})).target;})()');
  const base = target();
  set(a, { 'lt-pension-spending': 2000 });
  const lowerLate = target();
  assert.ok(lowerLate < base, 'a lower need in the Rente lowers the target');
  set(a, { 'lt-monthly-withdraw': 3500 });
  assert.ok(target() > lowerLate, 'the Vorruhestand need still counts until 67');
  // Without Vorruhestand only the Rente need matters.
  set(a, { 'lt-withdraw-from': 67 });
  const noEarly = target();
  set(a, { 'lt-monthly-withdraw': 5000 });
  near(target(), noEarly, 1e-6);
});

test('the sheet saves all phases at once, removes defaults and moves a linked statutory pension', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-drv',JSON.stringify({points:12,age:67}));appStorage.setItem('lt-pension-spending','2500');");
  a.run('renderLifetimePageCalcs=()=>{}');/* Chart and cards need the real DOM */
  a.run('openPhasesSheet()');
  const fill = v => { for (const [k, x] of Object.entries(v)) a.el(k).value = x; };
  fill({ 'lp-a2': '55', 'lp-growth': '', 'lp-a3': '62', 'lpw-me-2': '70', 'lp-saving': '', 'lp-draw': '0', 'lp-a4': '66', 'lp-need3': '3.200', 'lp-need4': '' });
  a.run('_savePhasesSheet()');
  const doc = a.json('appStorage.document()');
  const fs = doc.forecast.settings;
  assert.equal(fs.saveUntilAge, 55);
  assert.equal(fs.retirementAge, 62);
  assert.equal(fs.monthlySpending, 3200);
  assert.equal(fs.phase2WorkPercent, 70);
  // Defaults are not stored: no saving, no withdrawal, the same need in the Rente, Rente = statutory pension start.
  for (const k of ['phase2SavingPercent', 'phase2MonthlyWithdrawal', 'pensionSpending', 'pensionStartAge']) assert.ok(!(k in fs), k);
  // The statutory pension started with the old Rente age and moves along.
  assert.equal(doc.retirement.primary.statutoryPension.retirementAge, 66);
  assert.equal(a.json('getLifetimeSettings()').phase4From, 66);
  // Phases out of order: nothing is stored.
  const before = a.storage.getItem(Data.KEY);
  a.run('openPhasesSheet()');
  fill({ 'lp-a2': '60', 'lp-a3': '58', 'lp-a4': '67', 'lp-need3': '3000' });
  assert.throws(() => a.run('_savePhasesSheet()'), /folgen aufeinander/);
  assert.equal(a.storage.getItem(Data.KEY), before);
});

test('schema 10 keeps the phases in a backup; a version 9 backup reads with the previous behaviour', () => {
  const a = app(html); a.csv(demoCSV);
  set(a, { 'lt-save-until': 55, 'lt-withdraw-from': 60, 'lt-pension-age': 66, 'lt-pension-spending': 2400, 'lt-p2-saving': 25, 'lt-p2-work': 80, 'lt-p2-withdraw': 300 });
  const backup = a.json('appStorage.exportBackup(new Date("2026-10-08"))');
  assert.equal(backup.schemaVersion, Data.VERSION);
  assert.deepEqual(
    ['pensionStartAge', 'pensionSpending', 'phase2SavingPercent', 'phase2WorkPercent', 'phase2MonthlyWithdrawal'].map(k => backup.forecast.settings[k]),
    [66, 2400, 25, 80, 300]);
  const b = app(html); b.context.backup = backup;
  b.run('appStorage.importBackup(backup)');
  assert.deepEqual(b.json('appStorage.document()').forecast.settings, backup.forecast.settings);
  // Version 9: no phase fields, accepted and read with defaults.
  const old = JSON.parse(JSON.stringify(backup)); old.schemaVersion = 9;
  for (const k of ['pensionStartAge', 'pensionSpending', 'phase2SavingPercent', 'phase2WorkPercent', 'phase2MonthlyWithdrawal']) delete old.forecast.settings[k];
  const c = app(html); c.context.backup = old;
  c.run('appStorage.importBackup(backup)');
  const s = c.json('getLifetimeSettings()');
  assert.deepEqual([s.p2Work, s.p2Saving, s.pensionSpending], [1, 0, s.monthlyWithdraw]);
  assert.equal(c.json('appStorage.document()').schemaVersion, Data.VERSION);
  // Unknown future versions are still rejected.
  const future = JSON.parse(JSON.stringify(backup)); future.schemaVersion = Data.VERSION + 1;
  assert.throws(() => Data.validate(future), /nicht unterstützte Version/);
});
