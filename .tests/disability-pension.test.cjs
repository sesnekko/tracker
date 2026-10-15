const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
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

test('invalid kinds and shared pension values on other people are rejected', () => {
  const kind = Data.empty(); kind.retirement.primary.statutoryPension.disabilityType = 3;
  assert.throws(() => Data.validate(kind), /teilweise \(1\) oder voll \(2\)/);
  const shared = Data.empty();
  shared.retirement.people.push({ id: 'person-1', name: 'Partner', statutoryPension: { pensionPointValue: 40 } });
  assert.throws(() => Data.validate(shared), /gehören zur eigenen Person/);
  const partnerKind = Data.empty();
  partnerKind.retirement.people.push({ id: 'person-1', name: 'Partner', statutoryPension: { disabilityType: 0 } });
  assert.throws(() => Data.validate(partnerKind), /teilweise \(1\) oder voll \(2\)/);
  const v7 = Data.empty(); v7.schemaVersion = 7;
  assert.doesNotThrow(() => Data.validate(v7));
});

test('version 8: other people store the same EM fields and they survive a backup', () => {
  const store = Data.createStore(new MemoryStorage());
  const partner = { name: 'Anna', by: 1987, until: 67, points: 12.8, salary: 18000, age: 0, deduct: 20, emType: 2, em: 950, emUntil: 2031 };
  store.setItem('lt-drv-extra', JSON.stringify([partner]));
  const doc = store.document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.deepEqual(doc.retirement.people[0].statutoryPension,
    { points: 12.8, annualSalary: 18000, retirementAge: 0, deductionPercent: 20, disabilityType: 2, disabilityPension: 950, disabilityUntilYear: 2031 });
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), doc);
  const back = JSON.parse(target.getItem('lt-drv-extra'))[0];
  delete back.id;
  assert.deepEqual(back, partner);
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
  // 40 % of the excess reduce the gross pension; net that is less by the deductions (20 %).
  near(full.em.amount, 1200 - 0.4 * (25000 - 20763.75) / 12 * 0.8);
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

test('other people: EM pension uses their own age and is converted to the own age in the forecast', () => {
  const a = app(html); a.csv(demoCSV);
  // Own person born 1980, partner born 1987 (7 years younger).
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-birth-month','1');");
  const calc = p => a.json(`calcDrvExtra(getLifetimeSettings(),${JSON.stringify(p)})`);
  const base = { name: 'Anna', by: 1987, until: 67, points: 10, salary: 20000, deduct: 20 };
  const part = calc(Object.assign({ emType: 1, em: 600 }, base));
  assert.equal(part.em.amount, 600);
  assert.equal(part.em.until, 67);
  assert.equal(part.em.untilMain, 74);
  assert.equal(part.fromMain, 74);
  assert.equal(part.em.full, 1200);
  assert.ok(part.netto >= 1200);
  // Full EM: the uniform earnings limit applies, 40 % of the excess is offset.
  const full = calc(Object.assign({ emType: 2, em: 1000 }, base, { salary: 24000 }));
  near(full.em.limit, 20763.75);
  near(full.em.amount, 1000 - 0.4 * (24000 - 20763.75) / 12 * 0.8);
  // Ends after 2030: the partner is 44 then, i.e. own age 51.
  const ends = calc(Object.assign({ emType: 2, em: 1000, emUntil: 2030 }, base));
  near(ends.em.until, 44);
  near(ends.em.untilMain, 51);
  assert.equal(ends.em.full, 0);
  // Type "Keine" (0) is dropped like for the own pension. Seit 15.10.2026 gilt eine Hinzuverdienstgrenze laut Bescheid
  // bei beiden Arten (Anforderung „individuelle Hinzuverdienstgrenzen ermöglichen“); vorher wurde sie bei voller EM verworfen.
  assert.equal(calc(Object.assign({ emType: 0, em: 900 }, base)).em, undefined);
  const r = a.json(`(()=>{const p=Object.assign({emType:'2',em:1000,emLimit:50000,emUntil:''},${JSON.stringify(base)});_drvEmClean(p);return p;})()`);
  assert.equal(r.emType, 2);
  assert.equal(r.emLimit, 50000);
  assert.equal('emUntil' in r, false);

  a.run(`appStorage.setItem('lt-drv-extra',JSON.stringify([${JSON.stringify(Object.assign({ emType: 2, em: 1000, emUntil: 2030 }, base))}]));`);
  const plan = a.json('(()=>{const p=buildPlan();return{pensions:p.pensions,extra:p.drvExtra};})()');
  const em = plan.pensions.find(x => x.from === 0);
  assert.equal(em.amount, 1000);
  near(em.until, 51);
  assert.ok(plan.pensions.some(x => x.from === 74 && x.amount === plan.extra[0].netto));
  // A partner with only an EM pension (no points, no salary) still counts.
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{name:'Anna',by:1987,emType:2,em:800,emUntil:2030}]));");
  const only = a.json('(()=>{const p=buildPlan();return{pensions:p.pensions,extra:p.drvExtra.length};})()');
  assert.equal(only.extra, 1);
  assert.ok(only.pensions.some(x => x.from === 0 && x.amount === 800));
});

test('after work ends the forecast counts the full EM pension: the earnings offset applies only while earning', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','50');appStorage.setItem('lt-withdraw-from','55');");
  a.run("appStorage.setItem('lt-drv',JSON.stringify({points:20,salary:30000,emType:2,em:1200}));");
  const p = a.json('(()=>{const p=buildPlan();return{em:p.drv.em,entry:p.pensions.find(x=>x.from===0)};})()');
  assert.ok(p.em.cut > 0 && p.em.amount < 1200, 'today the part-time salary is offset');
  assert.equal(p.entry.amount, 1200, 'from the end of work on (Vorruhestand) no offset');
  assert.equal(p.entry.until, 67);
});

test('other people: the EM offset ends when they stop working, then the full EM pension counts', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1980');");
  // Partner born 1987 works until 60 (own age 67), full EM 1000 € with a salary over the limit, EM until 67 (own age 74).
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{name:'Anna',by:1987,until:60,points:10,salary:24000,deduct:20,emType:2,em:1000}]));");
  const r = a.json('(()=>{const p=buildPlan();const x=p.drvExtra[0];return{x,em:p.pensions.filter(q=>q.from<x.em.untilMain&&q.until===x.em.untilMain||q.until===Math.min(x.workEndMain,x.em.untilMain)&&q.from===0)};})()');
  assert.equal(r.x.workEndMain, 67);
  assert.equal(r.x.em.untilMain, 74);
  const offset = r.em.find(q => q.from === 0), full = r.em.find(q => q.from === 67);
  near(offset.amount, r.x.em.amount);
  assert.equal(offset.until, 67);
  assert.equal(full.amount, 1000);
  assert.equal(full.until, 74);
});

test('an EM pension turns into the old-age pension at the Regelaltersgrenze, even if the Rente phase starts later', () => {
  const a = app(html);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-pension-age','69');");
  const calc = d => a.json(`calcDrvPension(getLifetimeSettings(),Object.assign(getDrv(),${JSON.stringify(d)}))`);
  const em = calc({ points: 20, emType: 1, em: 700 });
  assert.equal(em.age, 67);
  assert.equal(em.em.until, 67);
  assert.equal(em.em.full, 1400);
  // Without EM, or with an EM pension that ends earlier, the old-age pension follows the Rente phase.
  assert.equal(calc({ points: 20 }).age, 69);
  assert.equal(calc({ points: 20, emType: 2, em: 900, emUntil: 2030 }).age, 69);
});

test('old-age pension after a partial EM pension: the higher of the protected minimum and the points including part-time work', () => {
  const a = app(html);
  // 46,75 years old, works part-time until 67; salary = average salary → 1 point per year.
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-withdraw-from','67');");
  const calc = d => a.json(`calcDrvPension(getLifetimeSettings(),Object.assign(getDrv(),${JSON.stringify(d)}))`);
  const working = calc({ points: 20, salary: 51944, emType: 1, em: 500 });
  near(working.epTotal, 20 + (67 - 46.75));
  // § 77 Abs. 3 SGB VI (seit 15.10.2026 abgebildet): die 20 Punkte, die schon Grundlage der EM-Rente waren, behalten deren
  // Zugangsfaktor (ohne Angabe 0,892); die neuen Punkte aus der Teilzeit zählen mit dem Faktor der Altersrente (1,0).
  // Sollwert korrigiert (Schema 19): bei teilweiser Erwerbsminderung gilt der alte Faktor nur für die Hälfte der Punkte
  // (§ 77 Abs. 3 Satz 2 SGB VI), die andere Hälfte bekommt 1,0. Vorher: 20 × 0,892.
  near(working.calcNetto, (20 * (0.5 * 0.892 + 0.5 * 1) + (67 - 46.75)) * 42.52 * 0.8);
  assert.ok(working.calcNetto > 1000);
  near(working.netto, working.calcNetto);
  // Without further points the protected minimum (twice the partial EM pension) applies.
  const minimum = calc({ points: 20, emType: 1, em: 500 });
  assert.ok(minimum.calcNetto < 1000);
  assert.equal(minimum.netto, 1000);
});
