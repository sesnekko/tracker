/* Block D der Fehlerbehebung: Renten, Pensionen, Förderung und Haushaltseinkommen (P3, P5, P11, P12, P25, P29)
   sowie die Schema-13-Felder. Erwartungen sind aus den Rechtsregeln bzw. einfacher Geldfluss-Arithmetik abgeleitet,
   nicht aus der Implementierung. Harness-Datum 08.10.2026, geboren Januar 1985 (Regelaltersgrenze 67). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, context, simulate, near, Data, MemoryStorage } = require('./forecast-fixture.cjs');

const working = { saveUntilAge: 60, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90 };
const set = (a, key, value) => { a.context.fxValue = JSON.stringify(value); a.run(`appStorage.setItem(${JSON.stringify(key)},fxValue);`); };
/* Gehalt einer Person = ihr zugeordneter Budget-Einnahmeposten (Schema 14) */
const salary = (a, person, amount) => set(a, 'budgetData', { einkommen: [{ id: 'budget-s', name: 'Nettogehalt', subcat: '', kind: 'income', targetGroupId: null, person, values: Array(12).fill(amount) }],
  fixe: [], variable: [], sparen: [], accounts: {}, standingOrders: [] });

/* ── P3: Zugangsfaktor und frühester Beginn der gesetzlichen Altersrente (§§ 36, 77 SGB VI) ── */
test('P3: Altersrente vor der Regelaltersgrenze sinkt um 0,3 % je Monat, danach steigt sie um 0,5 % je Monat', () => {
  const a = context(fixture());
  const drv = age => a.json(`(()=>{const r=calcDrvPension(getLifetimeSettings(),Object.assign({},DRV_DEFAULTS,{points:30,deduct:0,age:${age}}));return{age:r.age,zf:r.zf,brutto:r.brutto,m:r.zfMonths};})()`);
  const full = 30 * 42.52;
  let r = drv(67); near(assert, r.zf, 1); near(assert, r.brutto, full, 1e-6);
  r = drv(64); assert.equal(r.m, -36); near(assert, r.brutto, full * (1 - 36 * 0.003), 1e-6, '36 Monate früher = −10,8 %');
  r = drv(60); assert.equal(r.age, 63, 'frühestens mit 63'); near(assert, r.brutto, full * (1 - 0.144), 1e-6, 'höchstens −14,4 %');
  r = drv(69); assert.equal(r.m, 24); near(assert, r.brutto, full * 1.12, 1e-6, '24 Monate später = +12 %');
  // Ohne eigenes Alter gilt „Rente ab“ aus den Lebensphasen (hier 50) – frühestens 63, also mit vollem Abschlag
  r = drv(0); assert.equal(r.age, 63); near(assert, r.brutto, full * 0.856, 1e-6);
});
test('P3: die Prognose zahlt die gekürzte Rente ab 63, nicht die ungekürzte ab dem Phasenbeginn', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 }], { planningHorizonAge: 70 }));
  set(a, 'lt-drv', { points: 30, deduct: 0 });
  const p = a.json(`(()=>{const p=buildPlan();return p.pensions.filter(x=>x.kind==='drv');})()`);
  assert.equal(p.length, 1); assert.equal(p[0].from, 63); near(assert, p[0].amount, 30 * 42.52 * 0.856, 1e-6);
});

/* ── P29: Ruhegehalt nach BeamtVG (Bund) ── */
test('P29: Pension erst ab fünf Dienstjahren, Abschlag höchstens 14,4 %, ohne Abschlag mit 65 und 45 Jahren', () => {
  const a = context(fixture());
  const bv = b => a.json(`calcBeamtePension(getLifetimeSettings(),Object.assign({},BV_DEFAULTS,${JSON.stringify(b)}))`);
  let r = bv({ pay: 4000, years: 4.5, age: 67, deduct: 0 });
  assert.equal(r.eligible, false); assert.equal(r.brutto, 0, 'unter fünf Jahren kein Ruhegehalt (§ 4 BeamtVG)');
  r = bv({ pay: 4000, years: 5, age: 67, deduct: 0 });
  // 5 × 1,79375 % = 8,97 % → Mindestsatz 35 %; Beginn mit dem Phasenalter 50 → frühestens 63 → 4 Jahre × 3,6 % = 14,4 %
  assert.equal(r.eligible, true); assert.equal(r.age, 63); near(assert, r.brutto, 4000 * 0.35 * (1 - 0.144), 1e-6);
  r = bv({ pay: 4000, years: 30, age: 67, from: 64, deduct: 0 });
  near(assert, r.brutto, 4000 * (30 * 1.79375 / 100) * (1 - 3 * 0.036), 1e-6, '3 Jahre früher = 10,8 %');
  r = bv({ pay: 4000, years: 45, age: 67, from: 65, deduct: 0 });
  near(assert, r.brutto, 4000 * 0.7175, 1e-6, 'mit 65 und 45 Dienstjahren kein Abschlag, Satz höchstens 71,75 %');
  r = bv({ pay: 4000, years: 44, age: 67, from: 65, deduct: 0 });
  near(assert, r.brutto, 4000 * 0.7175 * (1 - 2 * 0.036), 1e-6, 'mit 44 Jahren bleibt der Abschlag');
});

/* ── P25: Zulagen je Person und Kind, nicht je Depot (§§ 84–86 EStG n. F.) ── */
test('P25: Kinderzulage je Kind, Mindesteigenbeitrag 120 €', () => {
  const a = context(fixture());
  assert.deepEqual(a.json('avdSubsidy(300,2)'), { base: 150, child: 600, total: 750 });
  assert.deepEqual(a.json('avdSubsidy(119,0)'), { base: 0, child: 0, total: 0 });
  assert.deepEqual(a.json('avdSubsidy(1800,0)'), { base: 540, child: 0, total: 540 });
  assert.deepEqual(a.json('avdSubsidy(5000,0)').base, 540, 'Grundzulage höchstens 540 €');
});
test('P25: Aufteilen desselben Eigenbeitrags auf zwei Depots ändert die Zulagen nicht', () => {
  const a = context(fixture(undefined, working));
  const year = (list, y) => a.json(`_avdYearAll(getLifetimeSettings(),${y},${JSON.stringify(list)})`);
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2020 }]);
  const one = year([{ id: 'd1', contrib: 300 }], 2027);
  const two = year([{ id: 'd1', contrib: 150 }, { id: 'd2', contrib: 150 }], 2027);
  // 3.600 € Eigenbeitrag: 50 % × 360 + 25 % × 1.440 = 540 € Grundzulage, ein Kind 300 €
  near(assert, one[0].total, 840); near(assert, two[0].total + two[1].total, 840);
  near(assert, two[0].total, 420, 1e-9, 'Verteilung nach Eigenbeitrag');
});
test('P25: ein Kind zählt nur bei einer Person, der Berufseinsteigerbonus nur einmal je Person', () => {
  const a = context(fixture(undefined, working));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 2005, until: 67 }]);
  // Schema 14: das Kind ist eine Person und der Kinderzulage-Elternteil ist ausdrücklich zugeordnet (leer = ich)
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2020 }]);
  const year = (list, y) => a.json(`_avdYearAll(getLifetimeSettings(),${y},${JSON.stringify(list)})`);
  const r = year([{ id: 'd1', contrib: 100 }, { id: 'd2', person: 'p1', contrib: 100 }], 2027);
  // je 1.200 €: Grundzulage 180 + 210 = 390 €; das Kind ist mir zugeordnet
  near(assert, r[0].child, 300); near(assert, r[0].base, 390);
  near(assert, r[1].child, 0, 1e-9, 'dasselbe Kind nicht ein zweites Mal');
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2020, parent: 'p1' }]);
  const k = year([{ id: 'd1', contrib: 100 }, { id: 'd2', person: 'p1', contrib: 100 }], 2027);
  near(assert, k[0].child, 0, 1e-9); near(assert, k[1].child, 300, 1e-9, 'Kinderzulage bei Kim');
  near(assert, r[1].bonus, 200, 1e-9, 'Kim ist 2027 zu Beginn des Jahres 21 → Bonus');
  const split = [{ id: 'd2', person: 'p1', contrib: 50 }, { id: 'd3', person: 'p1', contrib: 50 }];
  const y27 = year(split, 2027), y28 = year(split, 2028);
  near(assert, y27[0].bonus + y27[1].bonus, 200, 1e-9, 'Bonus einmal je Person, auch bei zwei Depots');
  near(assert, y28[0].bonus + y28[1].bonus, 0, 1e-9, 'nur im ersten Beitragsjahr');
});

/* ── P5: Nettogehalt einer weiteren Person deckt Haushaltsbedarf, solange sie arbeitet ── */
test('P5: Partnergehalt bis zum Arbeitsende senkt die Entnahme, danach trägt das Vermögen den vollen Bedarf', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 43 }]); salary(a, 'p1', 600);
  const r = simulate(a);
  // Oktober 2026 bis Juni 2028 = 15 Monate mit 400 € Entnahme, danach 1.000 €/Monat (Kim wird im Januar 2028 43)
  // Monate bis 42: Okt–Dez 2026 = 3; bis 43: 15 Monate (Kims Gehalt endet mit dem Monat vor dem 43. Geburtstag)
  near(assert, r.total[0], 20000 - 3 * 400, 1e-6, 'mit 42');
  near(assert, r.total[1], 20000 - 15 * 400, 1e-6, 'mit 43');
  near(assert, r.total[2], 20000 - 15 * 400 - 12 * 1000, 1e-6, 'mit 44');
  assert.equal(r.short, null);
});
test('P5: das Partnergehalt zählt nicht, solange du selbst arbeitest (es steckt dann im Budget)', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000, saveUntilAge: 43, retirementAge: 43 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 44 }]); salary(a, 'p1', 600);
  const r = simulate(a);
  // bis 43 keine Entnahme, von 43 bis 44 nur 400 €/Monat
  near(assert, r.total[1], 20000, 1e-6); near(assert, r.total[2], 20000 - 12 * 400, 1e-6);
});

/* ── P11/P12: Einkommenskarte rechnet mit dem Phasenbeginn und den Altersangaben im eigenen Alter ── */
test('P11/P12: Einkommen zum Rentenbeginn und dauerhaftes Einkommen', () => {
  const a = context(fixture(undefined, { planningHorizonAge: 90, pensionStartAge: 50, pensionSpending: 2000 }));
  a.context.fxPension = [{ name: 'Miete', amount: 800, from: 50 }, { name: 'Minijob', amount: 500, from: 45, until: 52 }];
  a.run("appStorage.setItem('lt-pensions',JSON.stringify(fxPension));");
  // Kim ist zwei Jahre jünger und arbeitet bis 55 (dein Alter 57), danach Rente aus 10 Punkten ab Kims 67 (dein Alter 69)
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 55, points: 10, deduct: 0 }]); salary(a, 'p1', 700);
  const c = a.json(`(()=>{const c=_incomeCard(buildPlan());return{need:c.need,start:c.start,steady:c.steady,rows:c.rows.map(r=>({n:r.n,v:r.v,from:r.from,until:r.until}))};})()`);
  assert.equal(c.need, 2000);
  assert.equal(c.start.age, 50);
  near(assert, c.start.sum, 800 + 500 + 700, 1e-6, 'mit 50: Miete + Minijob + Kims Gehalt');
  near(assert, c.start.cov, 1, 1e-9);
  const kim = c.rows.find(r => r.n === 'Rente Kim');
  assert.equal(kim.from, 69, 'Kims Rentenbeginn in deinem Alter');
  near(assert, kim.v, 10 * 42.52, 1e-6);
  assert.equal(c.steady.age, 69); near(assert, c.steady.sum, 800 + 10 * 42.52, 1e-6, 'befristete Einkünfte zählen nicht dauerhaft');
});

/* ── Schema 13/14: Geburtsmonat und Einkunftsende, Migration und Fehlerfälle (Personenzuordnung: persons.test.cjs) ── */
const legacy = { 'lt-birth-year': '1985', 'lt-birth-month': '5', 'lt-drv-extra': JSON.stringify([{ id: 'person-1', name: 'Kim', by: 1987, until: 60 }]),
  'lt-pensions': JSON.stringify([{ id: 'income-1', name: 'Minijob', amount: 400, from: 63, until: 70 }]) };
test('Schema 14: Einkunftsende und Geburtsmonat werden gespeichert und zurückgegeben', () => {
  const store = Data.createStore(new MemoryStorage(legacy)), doc = store.document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.equal(doc.retirement.primary.birthMonth, 5);
  assert.equal(doc.retirement.incomes[0].untilAge, 70);
  assert.equal(JSON.parse(store.getItem('lt-pensions'))[0].until, 70);
  const restored = Data.createStore(new MemoryStorage()); restored.importBackup(store.exportBackup());
  assert.deepEqual(restored.document(), doc, 'Export → Import unverändert');
});
test('Schema 14: ein Schema-12-Dokument wird ohne Verlust übernommen', () => {
  const store = Data.createStore(new MemoryStorage(legacy)), v12 = store.document();
  v12.schemaVersion = 12; delete v12.retirement.incomes[0].untilAge;
  const migrated = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(v12) })).document();
  assert.equal(migrated.schemaVersion, Data.VERSION);
  assert.deepEqual({ ...migrated, schemaVersion: 12 }, v12);
});
test('Schema 14: ungültige Werte werden beim Import abgelehnt und ändern nichts', () => {
  const storage = new MemoryStorage(legacy), store = Data.createStore(storage), raw = storage.getItem(Data.KEY);
  for (const mutate of [
    d => { d.retirement.primary.birthMonth = 13; },
    d => { d.retirement.primary.birthMonth = 2.5; },
    d => { d.retirement.primary.monthlyNetIncome = 1000; },
    d => { d.retirement.incomes[0].untilAge = 63; },
    d => { d.retirement.incomes[0].untilAge = 'x'; }
  ]) {
    const bad = store.exportBackup(); mutate(bad);
    assert.throws(() => store.importBackup(bad));
    assert.equal(storage.getItem(Data.KEY), raw);
  }
});
test('Schema 14: unvollständige Eingaben in der App lösen keinen Speicherfehler aus', () => {
  const store = Data.createStore(new MemoryStorage(legacy));
  // beim Tippen von „70“ steht kurz „7“ im Feld: Ende vor dem Beginn wird nicht gespeichert, statt den Speichervorgang abzulehnen
  store.setItem('lt-pensions', JSON.stringify([{ id: 'income-1', name: 'Minijob', amount: 400, from: 63, until: 7 }]));
  assert.equal(store.document().retirement.incomes[0].untilAge, undefined);
  store.setItem('lt-birth-month', '13');
  assert.equal(store.document().retirement.primary.birthMonth, 5, 'ungültiger Monat ändert den gespeicherten Wert nicht');
});

/* ── Schema 14: weitere Einkünfte einer Person rechnen in deren Alter ── */
test('Personen: „ab Alter“ einer Einkunft gilt im Alter der zugeordneten Person', () => {
  const a = context(fixture(undefined, { planningHorizonAge: 90, pensionStartAge: 67, pensionSpending: 2000 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 60 }]);
  a.context.fxPension = [{ name: 'Betriebsrente', amount: 300, from: 67, until: 80, person: 'p1' }, { name: 'Miete', amount: 500, from: 67 }];
  a.run("appStorage.setItem('lt-pensions',JSON.stringify(fxPension));");
  const p = a.json("buildPlan().pensions.filter(x=>x.kind==='income').map(x=>[x.amount,x.from,x.until??null])");
  // Kim ist zwei Jahre jünger: Kims 67 = dein 69, Kims 80 = dein 82
  assert.deepEqual(p, [[300, 69, 82], [500, 67, null]]);
  const row = a.json("_incomeCard(buildPlan()).rows.find(r=>r.n.startsWith('Betriebsrente'))");
  assert.equal(row.n, 'Betriebsrente Kim'); assert.equal(row.from, 69); assert.match(row.when, /\(Kim 67–80\)/);
});

/* ── P5: Texte trennen das Gehalt weiterer Personen von den Renten ── */
test('P5: Phasen und Partner-Story nennen das Partnergehalt als Gehalt, nicht als Rente', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 500000 }],
    { saveUntilAge: 50, retirementAge: 55, pensionStartAge: 60, planningHorizonAge: 70, monthlySpending: 3000, pensionSpending: 2500 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 62 }]); salary(a, 'p1', 1000);
  a.context.fxPension = [{ name: 'Betriebsrente', amount: 600, from: 60 }];
  a.run("appStorage.setItem('lt-pensions',JSON.stringify(fxPension));");
  const t = a.json(`(()=>{const s=getLifetimeSettings(),p=buildPlan(),b=_phaseBounds(s,p.currentAge,p.horizonAge);return{at55:_pensionsAt(p,55),w55:_workAt(p,55).sum,p3:_phaseText(s,p,2,b),p4:_phaseText(s,p,3,b)};})()`);
  assert.equal(t.at55, 0, 'mit 55 noch keine Rente'); assert.equal(t.w55, 1000);
  // Vorruhestand: 3.000 € Bedarf − 1.000 € Gehalt = 2.000 € aus dem Vermögen; Rente: 2.500 − 1.000 − 600 = 900 €
  assert.match(t.p3, /^2\.000 €.*aus dem Vermögen · 1\.000 € Gehalt$/, 'Gehalt läuft über den Vorruhestand hinaus (bis 62 > 60)');
  assert.match(t.p4, /^1\.000 € Gehalt bis 62 \+ 600 € Renten \+ 900 € aus dem Vermögen$/);
  // Die Seite selbst braucht das echte DOM; die Story liest nur den Rechenstand
  a.run('(()=>{const p=buildPlan();_ltState={plan:p,mc:runMonteCarlo(p,p.s.withdrawFrom,true),infl:p.s.inflation/100,currentAge:p.currentAge};})()');
  const slides = a.json('_psSlides().map(x=>x.text)').map(x => x.replace(/\u00a0/g, ' '));
  assert.ok(slides.some(x => /Kim arbeitet bis 2047 weiter: 1\.000 € im Monat aus dem Gehalt, 2\.000 € aus dem Ersparten/.test(x)), slides.join('\n'));
  assert.ok(slides.some(x => /Dann kommen die Renten: 600 € im Monat\. Dazu 1\.000 € Gehalt, Kim arbeitet bis 2047\. Den Rest von 900 €/.test(x)), slides.join('\n'));
});
