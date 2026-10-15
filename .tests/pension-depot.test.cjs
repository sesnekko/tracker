const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);

test('subsidies: 50 % on the first 360 €, 25 % up to 1.800 €, child bonus 1:1 up to 300 € per child', () => {
  const a = app(html);
  const sub = (own, kids) => a.json(`avdSubsidy(${own},${kids})`);
  assert.deepEqual(sub(1800, 0), { base: 540, child: 0, total: 540 });
  assert.deepEqual(sub(360, 0), { base: 180, child: 0, total: 180 });
  assert.deepEqual(sub(3000, 0), { base: 540, child: 0, total: 540 });
  assert.deepEqual(sub(600, 1), { base: 240, child: 300, total: 540 });
  assert.deepEqual(sub(600, 2), { base: 240, child: 600, total: 840 });
  // Sollwert korrigiert (14.10.2026): § 86 EStG i. d. F. des Altersvorsorgereformgesetzes (BR-Drs. 206/26, Art. 2 Nr. 9)
  // gewährt Grund- und Kinderzulage nur mit mindestens 120 € Eigenbeitrag. Früher erwartet: 50 + 100 = 150 €.
  assert.deepEqual(sub(100, 1), { base: 0, child: 0, total: 0 });
  assert.deepEqual(sub(120, 1), { base: 60, child: 120, total: 180 });
});

test('depot value and payout plan until 85 (no return, no inflation: plain sums)', () => {
  const a = app(html);
  // Today is 2026-10-08 in the harness. Born 1985, saving until 67, Regelalter 67.
  a.run("appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-withdraw-from','67');appStorage.setItem('lt-inflation','0');");
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
  a.run("appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-withdraw-from','67');appStorage.setItem('lt-inflation','0');");
  const calc = d => a.json(`calcAvDepot(getLifetimeSettings(),${JSON.stringify(d)})`);
  const base = calc({ contrib: 50, ret: 0, deduct: 0 });
  // Schema 14: children are persons; the subsidy counts for the parent they are assigned to (empty = me).
  a.run("appStorage.setItem('lt-children',JSON.stringify([{id:'child-1',name:'Lena',by:2019}]));");
  const kid = calc({ contrib: 50, ret: 0, deduct: 0 });
  // Child born 2019: Kinderzulage for 2027–2037 (11 years), 300 € each with 600 € own contribution.
  near(kid.capReal - base.capReal, 11 * 300);
  assert.equal(kid.firstSub.kids, 1);
  // Child benefit until 25 (education): the subsidy runs until 2044.
  a.run("appStorage.setItem('lt-children',JSON.stringify([{id:'child-1',name:'Lena',by:2019,until:25}]));");
  near(calc({ contrib: 50, ret: 0, deduct: 0 }).capReal - base.capReal, 18 * 300);
  a.run("appStorage.setItem('lt-children','[]');");
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
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.deepEqual(doc.retirement.pensionDepots[0], { id: 'depot-1', name: 'AV-Depot', personId: 'person-main', monthlyContribution: 150 });
  /* Schema 14 (Entscheidung 14.10.2026): Kinder sind Personen. Jahrgänge am Depot werden zu Kindern mit Kinderzulage
     bei der Depotinhaberin; das Depot selbst trägt keine Jahrgänge mehr. */
  assert.deepEqual(doc.retirement.pensionDepots[1], {
    id: 'depot-2', name: 'AV-Depot Anna', personId: 'person-1', monthlyContribution: 50, balance: 1200, startYear: 2028,
    returnPercent: 6, payoutAge: 66, lumpSumPercent: 30, deductionPercent: 15
  });
  assert.deepEqual(doc.retirement.children, [
    { id: 'child-1', name: 'Kind (2019)', birthYear: 2019, allowanceParentId: 'person-1' },
    { id: 'child-2', name: 'Kind (2022)', birthYear: 2022, allowanceParentId: 'person-1' }]);
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), doc);
  const back = JSON.parse(target.getItem('lt-av-depots')).map(({ id, ...r }) => r);
  assert.deepEqual(back, rows.map(({ kids, ...r }) => r));
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
  // Jahrgänge am Depot nur bis Version 13 (danach Kinder als Personen)
  const v13 = depot({ childBirthYears: '2019' }); v13.schemaVersion = 13;
  assert.throws(() => Data.validate(v13), /Liste erwartet/);
  assert.throws(() => Data.validate(depot({ childBirthYears: [2019] })), /unbekanntes Feld/);
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

test('budget: from the start year the contribution counts as saving, the subsidy as income and saving', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'depot-1',name:'AV',contrib:150}]));");
  const month = (ym, m) => a.json(`(()=>{selectedMonth='${ym}';const c=calcBudgetMonth(loadBudgetData(),${m});return{frei:c.frei,einnahmen:c.einnahmen,spar:c.sparplaene,sparItems:c.sparItems.filter(i=>i.depot),einItems:c.einItems.filter(i=>i.depot)};})()`);
  const before = month('2026-10', 2);
  assert.deepEqual(before.sparItems, []);
  const after = month('2027-03', 2);
  assert.deepEqual(after.sparItems.map(i => [i.label, i.val]), [['AV – Beitrag', 150], ['AV – Zulage Ø', 45]]);
  assert.deepEqual(after.einItems.map(i => [i.label, i.val]), [['Zulage Ø · AV', 45]]);
  // The subsidy is income and saving at once; only the own contribution lowers the free amount.
  a.run("appStorage.setItem('lt-av-depots','[]');");
  const without = month('2027-03', 2);
  near(after.frei, without.frei - 150);
  near(after.einnahmen, without.einnahmen + 45);
});

test('budget: a linked saving item is replaced by the depot and the forecast does not count it twice', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'depot-1',name:'AV',contrib:150}]));");
  a.run("(()=>{const bd=loadBudgetData();bd.sparen.push({id:'budget-av',name:'AV-Depot',subcat:'',kind:'saving',targetGroupId:null,values:Array(12).fill(150),depotId:'depot-1'});saveBudgetData(bd);})()");
  assert.equal(a.json("loadBudgetData().sparen.find(r=>r.id==='budget-av').depotId"), 'depot-1');
  const spar = ym => a.json(`(()=>{selectedMonth='${ym}';return calcBudgetMonth(loadBudgetData(),2).sparItems.map(i=>i.label);})()`);
  assert.ok(!spar('2027-03').includes('AV-Depot'), 'linked item replaced');
  assert.ok(spar('2027-03').includes('AV – Beitrag'));
  // Forecast savings from the budget skip depot rows; the depot has its own model.
  const derived = () => a.json("(()=>{selectedMonth='2027-03';const r=deriveSavingsFromBudget(buildPlan());return{byGroup:r.byGroup,unmatched:r.unmatched};})()");
  const withDepot = derived();
  assert.ok(!withDepot.unmatched.some(n => /AV/.test(n)));
  // Retirement module off: no depot rows, the linked item counts as an ordinary saving item again.
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,pension:false,budget:true,forecast:true}));_modsCache=null;");
  const off = spar('2027-03');
  assert.ok(off.includes('AV-Depot'));
  assert.ok(!off.includes('AV – Beitrag'));
});

test('version 9: budget items keep their depot link; a removed depot leaves an ordinary saving item', () => {
  const store = Data.createStore(new MemoryStorage());
  store.setItem('lt-av-depots', JSON.stringify([{ id: 'depot-1', name: 'AV', contrib: 150 }]));
  store.setItem('budgetData', JSON.stringify({ einkommen: [], fixe: [], variable: [], sparen: [{ id: 'budget-av', name: 'AV-Depot', subcat: '', kind: 'saving', targetGroupId: null, values: Array(12).fill(150), depotId: 'depot-1' }] }));
  const item = store.document().budget.items.find(i => i.id === 'budget-av');
  assert.equal(item.depotId, 'depot-1');
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.deepEqual(target.document(), store.document());
  store.setItem('lt-av-depots', '[]');
  assert.equal('depotId' in store.document().budget.items.find(i => i.id === 'budget-av'), false);
  const v8 = Data.empty(); v8.schemaVersion = 8;
  assert.doesNotThrow(() => Data.validate(v8));
  const bad = JSON.parse(JSON.stringify(target.document()));
  bad.budget.items[0].kind = 'expense'; bad.budget.items[0].category = 'fixe';
  assert.throws(() => Data.validate(bad), /nur für Sparposten/);
  const dangling = JSON.parse(JSON.stringify(target.document()));
  dangling.retirement.pensionDepots = [];
  assert.throws(() => Data.validate(dangling), /unbekannter Verweis/);
});

test('a saving item named like a depot is suggested for linking', () => {
  const a = app(html);
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'depot-1',name:'AV-Depot Max (Demo)',contrib:150},{id:'depot-2',name:'AV-Depot Anna (Demo)',contrib:50}]));");
  assert.equal(a.run("_guessDepot('AV-Depot Max')"), 'depot-1');
  assert.equal(a.run("_guessDepot('Altersvorsorgedepot Anna')"), 'depot-2');
  assert.equal(a.run("_guessDepot('AV-Depot')"), '', 'ambiguous with two depots');
  assert.equal(a.run("_guessDepot('ETF Sparplan Max')"), '', 'only for depot words');
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'depot-1',name:'Mein Depot',contrib:150}]));");
  assert.equal(a.run("_guessDepot('Altersvorsorgedepot')"), 'depot-1', 'the only depot');
});

/* 15.10.2026: Kapital monatlich statt Jahresbeiträge am Jahresende. Nachrechnung mit unabhängiger Monatsformel:
   geboren Juli 1992 (Harness Oktober 2026), Arbeitsende mit 50 → Beiträge Jan 2027 – Jun 2042 (186 Monate),
   Auszahlung ab 67 (Juli 2059), 150 €/Monat + 540 € Zulage im Jahr (2042: 900 € eigene Beiträge → 315 € Zulage), 5 %. */
test('depot capital: monthly contributions until the month work ends, compounded monthly until the payout month', () => {
  const a = app(html);
  a.run("['lt-birth-year:1992','lt-birth-month:7','lt-save-until:40','lt-withdraw-from:50','lt-pension-age:67','lt-p2-work:50','lt-inflation:2'].forEach(x=>{const [k,v]=x.split(':');appStorage.setItem(k,v);})");
  const r = a.json("calcAvDepot(getLifetimeSettings(),{contrib:150,ret:5,deduct:20})");
  const i = Math.pow(1.05, 1 / 12) - 1; let cap = 0;
  for (let k = 0; k < 393; k++) { // Okt 2026 bis Jun 2059
    cap *= 1 + i; const y = 2026 + Math.floor((9 + k) / 12), m = (9 + k) % 12;
    if (y >= 2027 && (y < 2042 || (y === 2042 && m < 6))) cap += y < 2042 ? 150 + 45 : 150 + 315 / 6;
  }
  assert.equal(r.ownSum, 186 * 150, '186 Beitragsmonate, keiner im Vorruhestand');
  assert.equal(r.subSum, 15 * 540 + 315);
  assert.ok(Math.abs(r.capNom - cap) < 0.01, r.capNom + ' ≠ ' + cap);
  assert.ok(Math.abs(r.capReal - cap / Math.pow(1.02, 393 / 12)) < 0.01, 'heutige Kaufkraft über dieselben Monate');
  assert.match(a.run("_explainAvd(calcAvDepot(getLifetimeSettings(),{contrib:150,ret:5,deduct:20}))"), /Kapital<\/strong> mit 67: <strong>124\.098 €<\/strong>.*In heutiger Kaufkraft sind das 64\.880 €/);
});

/* REVIEW_2026-10 P42: Arbeitsende mitten im Jahr. Früher wurde das ganze Kalenderjahr am Alter zur Jahresmitte
   bewertet; bei einem Wechsel im Juli entfielen alle Beiträge und Zulagen des Jahres. Erwartung: Monate bis zum
   Arbeitsende zählen, die Jahreszulage folgt aus deren Summe (360 × 50 % + Rest × 25 %). */
test('depot contributions survive a midyear work stop', () => {
  const year = (bm, until) => {
    const a = app(html); a.csv(demoCSV);
    a.run(`appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-birth-month','${bm}');appStorage.setItem('lt-save-until','${until}');appStorage.setItem('lt-withdraw-from','${until}');appStorage.setItem('lt-pension-age','67');appStorage.setItem('lt-av-depots',JSON.stringify([{id:'d1',name:'Own',contrib:150,from:65,ret:0,deduct:0}]))`);
    return a.json("(()=>{const s=getLifetimeSettings(),d=getAvDepots()[0],z=avdYear(s,d,2027),r=calcAvDepot(s,d),pl=buildPlan().avdAll[0];return {own:z.own,base:z.base,mw:z.mw,sum:r.ownSum,sub:r.subSum,plan:pl.ownSum,later:avdYear(s,d,2028)};})()");
  };
  const jul = year(1, 42.5); // Januar 1985, Arbeitsende Juli 2027
  assert.equal(jul.own, 900); assert.equal(jul.base, 315);
  assert.deepEqual(jul.mw.map(w => w > 0), [true, true, true, true, true, true, false, false, false, false, false, false], 'Juli–Dezember ohne Eigenbeitrag');
  assert.equal(jul.sum, 900); assert.equal(jul.sub, 315); assert.equal(jul.plan, 900, 'Planrechnung zählt dieselben Monate');
  assert.equal(jul.later, null, 'danach keine Beiträge mehr');
  const apr = year(1, 42.25), oct = year(1, 42.75), bornApr = year(4, 42.5);
  assert.equal(apr.own, 450); assert.equal(apr.base, 202.5);
  assert.equal(oct.own, 1350); assert.equal(oct.base, 427.5);
  assert.equal(bornApr.own, 1350, 'geboren April: Arbeitsende Oktober, neun Beitragsmonate');
});
