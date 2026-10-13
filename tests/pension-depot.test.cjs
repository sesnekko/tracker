const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);

test('subsidies: 50 % on the first 360 €, 25 % up to 1.800 €, child bonus 1:1 up to 300 € per child', () => {
  const a = app(html);
  const sub = (own, kids) => a.json(`avdSubsidy(${own},${kids})`);
  assert.deepEqual(sub(1800, 0), { base: 540, child: 0, total: 540 });
  assert.deepEqual(sub(360, 0), { base: 180, child: 0, total: 180 });
  assert.deepEqual(sub(3000, 0), { base: 540, child: 0, total: 540 });
  assert.deepEqual(sub(600, 1), { base: 240, child: 300, total: 540 });
  assert.deepEqual(sub(600, 2), { base: 240, child: 600, total: 840 });
  assert.deepEqual(sub(100, 1), { base: 50, child: 100, total: 150 });
});

test('depot value and payout plan until 85 (no return, no inflation: plain sums)', () => {
  const a = app(html);
  // Today is 2026-10-08 in the harness. Born 1985, saving until 67, Regelalter 67.
  a.run("appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-inflation','0');");
  const calc = d => a.json(`calcAvDepot(getLifetimeSettings(),${JSON.stringify(d)})`);
  const r = calc({ contrib: 150, ret: 0, deduct: 0 });
  assert.equal(r.from, 67);
  assert.equal(r.first, 2027);
  assert.equal(r.lastYear, 2051);
  near(r.capReal, 25 * (1800 + 540));
  near(r.netto, 25 * 2340 / (18 * 12));
  const lump = calc({ contrib: 150, ret: 0, deduct: 0, lump: 30 });
  near(lump.lumpNet, 0.3 * 25 * 2340);
  near(lump.netto, 0.7 * 25 * 2340 / (18 * 12));
  // Deduction applies to payouts and the lump sum.
  near(calc({ contrib: 150, ret: 0, deduct: 20, lump: 30 }).lumpNet, 0.8 * 0.3 * 25 * 2340);
  // Payout age is limited to 65–70; a later start shortens the saving period.
  assert.equal(calc({ contrib: 150, from: 63 }).from, 65);
  assert.equal(calc({ contrib: 150, from: 72 }).from, 70);
  assert.equal(calc({ contrib: 150, ret: 0, start: 2030 }).first, 2030);
  // Returns: more capital than the sum of payments.
  assert.ok(calc({ contrib: 150 }).capReal > r.capReal);
  assert.equal(calc({ contrib: 0 }).capReal, 0);
});

test('children until the year they turn 18 and the one-time starter bonus for under-25s', () => {
  const a = app(html);
  a.run("appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-inflation','0');");
  const calc = d => a.json(`calcAvDepot(getLifetimeSettings(),${JSON.stringify(d)})`);
  const base = calc({ contrib: 50, ret: 0, deduct: 0 });
  const kid = calc({ contrib: 50, ret: 0, deduct: 0, kids: '2019' });
  // Child born 2019: Kinderzulage for 2027–2037 (11 years), 300 € each with 600 € own contribution.
  near(kid.capReal - base.capReal, 11 * 300);
  assert.equal(kid.firstSub.kids, 1);
  assert.equal(calc({ contrib: 50, kids: 'zwei' }).kidsBad, true);
  // Starter bonus: a partner born 2003 is 23 at the start of 2027; born 2001 is 25 → no bonus.
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'person-1',name:'Jung',by:2003},{id:'person-2',name:'Älter',by:2001}]));");
  assert.equal(calc({ contrib: 50, person: 'person-1' }).bonus, 200);
  assert.equal(calc({ contrib: 50, person: 'person-2' }).bonus, 0);
  // Ages of another person are converted to the own age for the forecast.
  const p = calc({ contrib: 50, person: 'person-1' });
  assert.equal(p.from, 67);
  assert.equal(p.fromMain, 67 + (2003 - 1985));
  assert.equal(p.untilMain, 85 + (2003 - 1985));
});

test('version 8 stores several depots per person and they survive a backup', () => {
  const store = Data.createStore(new MemoryStorage());
  store.setItem('lt-drv-extra', JSON.stringify([{ id: 'person-1', name: 'Anna', by: 1987 }]));
  const rows = [
    { name: 'AV-Depot', person: '', contrib: 150 },
    { name: 'AV-Depot Anna', person: 'person-1', contrib: 50, kids: '2019, 2022', balance: 1200, start: 2028, ret: 6, from: 66, lump: 30, deduct: 15 }
  ];
  store.setItem('lt-av-depots', JSON.stringify(rows));
  const doc = store.document();
  assert.equal(doc.schemaVersion, 8);
  assert.deepEqual(doc.retirement.pensionDepots[0], { id: 'depot-1', name: 'AV-Depot', personId: 'person-main', monthlyContribution: 150 });
  assert.deepEqual(doc.retirement.pensionDepots[1], {
    id: 'depot-2', name: 'AV-Depot Anna', personId: 'person-1', monthlyContribution: 50, balance: 1200, startYear: 2028,
    returnPercent: 6, payoutAge: 66, lumpSumPercent: 30, deductionPercent: 15, childBirthYears: [2019, 2022]
  });
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), doc);
  const back = JSON.parse(target.getItem('lt-av-depots')).map(({ id, ...r }) => r);
  assert.deepEqual(back, rows);
  // Unknown person (e.g. removed) falls back to the own person instead of failing the save.
  store.setItem('lt-av-depots', JSON.stringify([{ name: 'X', person: 'person-9', contrib: 10 }]));
  assert.equal(store.document().retirement.pensionDepots[0].personId, 'person-main');
});

test('invalid depots are rejected; version 7 files without depots stay readable', () => {
  const v7 = Data.empty(); v7.schemaVersion = 7;
  assert.doesNotThrow(() => Data.validate(v7));
  const depot = extra => { const d = Data.empty(); d.retirement.pensionDepots = [Object.assign({ id: 'depot-1', name: 'AV', personId: 'person-main', monthlyContribution: 10 }, extra)]; return d; };
  assert.doesNotThrow(() => Data.validate(depot({})));
  assert.throws(() => Data.validate(depot({ personId: 'person-9' })), /unbekannter Verweis/);
  assert.throws(() => Data.validate(depot({ lumpSumPercent: 40 })), /höchstens 30/);
  assert.throws(() => Data.validate(depot({ monthlyContribution: -5 })), /ungültige Zahl/);
  assert.throws(() => Data.validate(depot({ fees: 1 })), /unbekanntes Feld/);
  assert.throws(() => Data.validate(depot({ childBirthYears: '2019' })), /Liste erwartet/);
});

test('forecast: payouts count as income until 85, the partial lump sum flows into liquid assets', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{name:'AV',contrib:150,lump:30}]));");
  const plan = a.json('(()=>{const p=buildPlan();return{avd:p.avd,pensions:p.pensions,events:p.events};})()');
  assert.equal(plan.avd.length, 1);
  const r = plan.avd[0];
  assert.ok(plan.pensions.some(p => p.amount === r.netto && p.from === r.fromMain && p.until === r.untilMain));
  const ev = plan.events.find(e => e.name === 'Teilauszahlung AV');
  assert.equal(ev.amount, r.lumpNet);
  assert.equal(ev.toIdx, -1);
  assert.equal(ev.fromExt, true);
  // More income in retirement lowers the capital needed.
  const target = () => a.json('(()=>{const p=buildPlan();return targetCapital(p,p.s.withdrawFrom,simulatePlan(p,p.s.withdrawFrom,{record:true})).target;})()');
  const withDepot = target();
  a.run("appStorage.setItem('lt-av-depots','[]');");
  assert.ok(withDepot < target());
  // Retirement module off: no depots in the forecast.
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{name:'AV',contrib:150}]));appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,pension:false,budget:true,forecast:true}));_modsCache=null;");
  assert.deepEqual(a.json('buildPlan().avd'), []);
});
