/* Haushalt (Schema 14): Kinder als Personen. Kindergeld 259 € je Kind und Monat (§ 66 Abs. 1 EStG, Stand 2026), vom
   Geburtsmonat bis zu dem Monat, in dem das Kind 18 wird (§ 66 Abs. 2, § 32 Abs. 3); in Ausbildung bis 25 (§ 32 Abs. 4 Nr. 2).
   Erwartungen aus diesen Regeln, nicht aus der Implementierung. Harness-Datum 08.10.2026. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, context, simulate, near } = require('./forecast-fixture.cjs');

const set = (a, key, value) => { a.context.fxValue = JSON.stringify(value); a.run(`appStorage.setItem(${JSON.stringify(key)},fxValue);`); };
const budget = einkommen => ({ einkommen, fixe: [], variable: [], sparen: [], accounts: {}, standingOrders: [] });
const income = (id, name, amount) => ({ id, name, subcat: '', kind: 'income', targetGroupId: null, values: Array(12).fill(amount) });
const month = (a, ym) => a.json(`(()=>{const c=calcBudgetMonth(loadBudgetData(),${+ym.slice(5) - 1},false,'${ym}');return{ein:c.einnahmen,items:c.einItems.map(i=>i.label)};})()`);

test('Kindergeld erscheint automatisch im Budget und ersetzt einen manuellen Posten „Kindergeld“', () => {
  const a = context(fixture());
  set(a, 'budgetData', budget([income('b1', 'Gehalt', 3000), income('b2', 'Kindergeld', 250)]));
  assert.equal(month(a, '2026-10').ein, 3250, 'ohne erfasste Kinder bleibt der Posten');
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2019, bm: 5 }, { id: 'child-2', name: 'Tom', by: 2022 }]);
  const m = month(a, '2026-10');
  assert.equal(m.ein, 3000 + 2 * 259, 'zwei Kinder, nicht zusätzlich 250 €');
  assert.deepEqual(m.items, ['Gehalt', 'Kindergeld · 2 Kinder']);
});
test('Kindergeld vom Geburtsmonat bis zum Monat des 18. Geburtstags, in Ausbildung bis 25', () => {
  const a = context(fixture());
  set(a, 'budgetData', budget([income('b1', 'Gehalt', 3000)]));
  set(a, 'lt-children', [{ id: 'child-1', name: 'Mia', by: 2008, bm: 11 }, { id: 'child-2', name: 'Ben', by: 2026, bm: 3 }]);
  assert.equal(month(a, '2026-02').ein, 3000 + 259, 'Ben noch nicht geboren');
  assert.equal(month(a, '2026-03').ein, 3000 + 2 * 259, 'ab Bens Geburtsmonat');
  assert.equal(month(a, '2026-11').ein, 3000 + 2 * 259, 'Mia wird im November 18: November zählt noch');
  assert.equal(month(a, '2026-12').ein, 3000 + 259, 'ab Dezember ohne Mia');
  set(a, 'lt-children', [{ id: 'child-1', name: 'Mia', by: 2008, bm: 11, until: 25 }]);
  assert.equal(month(a, '2026-12').ein, 3000 + 259, 'in Ausbildung bis 25');
});
test('Prognose: Kindergeld deckt nach deinem Arbeitsende einen Teil des Bedarfs, bis das Kind 18 ist', () => {
  // ab heute im Ruhestand, Bedarf 1.000 €/Monat; Lena (Mai 2009) wird im Mai 2027 18 → Kindergeld Okt 2026 bis Mai 2027
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000 }));
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2009, bm: 5 }]);
  const r = simulate(a);
  near(assert, r.total[0], 20000 - 3 * (1000 - 259), 1e-6, 'mit 42 (Okt–Dez 2026)');
  near(assert, r.total[1], 20000 - 8 * (1000 - 259) - 7 * 1000, 1e-6, 'mit 43: 8 Monate mit, 7 ohne Kindergeld');
  const t = a.json(`(()=>{const s=getLifetimeSettings(),p=buildPlan(),b=_phaseBounds(s,p.currentAge,p.horizonAge);return{kg:_childBenefitPlanAt(p,p.currentAge),pens:_pensionsAt(p,p.currentAge)};})()`);
  assert.equal(t.kg, 259); assert.equal(t.pens, 0, 'Kindergeld ist keine Rente');
});
test('Prognose: solange du arbeitest, steckt das Kindergeld im Budget', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000, saveUntilAge: 43, retirementAge: 43 }));
  set(a, 'lt-children', [{ id: 'child-1', name: 'Lena', by: 2020 }]);
  const r = simulate(a);
  near(assert, r.total[1], 20000, 1e-6, 'bis 43 keine Entnahme');
  near(assert, r.total[2], 20000 - 12 * (1000 - 259), 1e-6, 'danach Bedarf minus Kindergeld');
});

/* ── Arbeitszeit je Lebensphase und Person (Schema 15, Entscheidung 14.10.2026) ──
   Phasen in deinem Alter: 1 Ansparen · 2 Weiterarbeiten · 3 Vorruhestand · 4 Rente. Je erwachsene Person eine
   Arbeitszeit je Phase (% einer Vollzeitstelle, leer = wie davor). Das Budget-Gehalt gilt für die Arbeitszeit von heute. */
const salaryBudget = (a, rows) => set(a, 'budgetData', budget(rows));
test('Arbeitszeit je Phase: nach deinem Arbeitsende zählt in der Phase nur der Anteil des Gehalts', () => {
  // ab heute im Ruhestand (Phase 3), Rente ab 43 (Phase 4), Bedarf 1.000 €; Kim (gleich alt) verdient 600 €,
  // arbeitet in Phase 4 halb, bis 44
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000, pensionSpending: 1000, pensionStartAge: 43 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 44, w4: 50 }]);
  salaryBudget(a, [{ ...income('b1', 'Gehalt Kim', 600), person: 'p1' }]);
  const r = simulate(a);
  near(assert, r.total[1], 20000 - 15 * 400, 1e-6, 'bis 43 volles Gehalt');
  near(assert, r.total[2], 20000 - 15 * 400 - 12 * 700, 1e-6, 'dann 300 € Gehalt, 700 € aus dem Vermögen');
});
test('Arbeitszeit je Phase: sinkt das Gehalt einer weiteren Person, während du noch arbeitest, kommt die Sparlücke aus dem Vermögen', () => {
  // Ansparen bis 43, du arbeitest bis 44 und sparst 500 € ins Cash (auch im Weiterarbeiten: 100 %);
  // Budget: 1.000 € + Kims 600 € − 1.100 € Ausgaben = 500 € Überschuss
  const rows = [{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }];
  const make = kim => {
    const d = fixture(rows, { saveUntilAge: 43, retirementAge: 44, phase2SavingPercent: 100 }); d.groups[0].assumptions.monthlySaving = 500;
    const a = context(d);
    set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 60, ...kim }]);
    set(a, 'budgetData', { ...budget([income('b1', 'Gehalt', 1000), { ...income('b2', 'Gehalt Kim', 600), person: 'p1' }]),
      fixe: [{ id: 'b3', name: 'Miete', subcat: '', kind: 'expense', targetGroupId: null, values: Array(12).fill(1100) }] });
    return a;
  };
  const a = make({ w2: 50 });
  assert.equal(a.json('buildPlan().funding.gap'), 0, 'heute ist alles finanziert');
  let r = simulate(a);
  near(assert, r.total[1], 10000 + 15 * 500, 1e-6, 'bis 43 voll gespart');
  near(assert, r.total[2], 10000 + 15 * 500 + 12 * (500 - 300), 1e-6, 'ab 43 fehlen 300 € im Monat');
  // hört Kim ganz auf, bevor du aufhörst, fehlt ihr ganzes Gehalt
  r = simulate(make({ until: 43 }));
  near(assert, r.total[2], 10000 + 15 * 500 - 12 * 100, 1e-6, 'ab 43: 500 € Sparen, 600 € fehlen');
});
test('Arbeitszeit je Phase: deine eigene Teilzeit senkt dein Gehalt, sobald es dir im Budget zugeordnet ist', () => {
  // Weiterarbeiten 43–44 mit 50 %; Gehalt 1.000 €, Miete 500 €, Sparen 500 € (auch im Weiterarbeiten)
  const make = own => {
    const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { saveUntilAge: 43, retirementAge: 44, phase2SavingPercent: 100, phase2WorkPercent: 50 });
    d.groups[0].assumptions.monthlySaving = 500;
    const a = context(d);
    set(a, 'budgetData', { ...budget([{ ...income('b1', 'Gehalt', 1000), ...(own ? { person: a.json('_ownPersonId()') } : {}) }]),
      fixe: [{ id: 'b3', name: 'Miete', subcat: '', kind: 'expense', targetGroupId: null, values: Array(12).fill(500) }] });
    return a;
  };
  let r = simulate(make(true));
  near(assert, r.total[2], 10000 + 15 * 500, 1e-6, 'ab 43: 500 € weniger Gehalt, 500 € Sparen aus dem Vermögen');
  // ohne Zuordnung kennt die App dein Gehalt nicht: wie bisher nur Rentenpunkte
  r = simulate(make(false));
  near(assert, r.total[2], 10000 + 27 * 500, 1e-6, 'ohne zugeordnetes Gehalt keine Änderung');
});
test('Arbeitszeit je Phase: arbeitet eine Person mehr als heute, wird das Mehreinkommen angelegt', () => {
  // Phase 2: du 50 % (−500 €), Kim von 50 % auf Vollzeit (600 € → 1.200 €, +600 €): 100 € mehr als heute
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { saveUntilAge: 43, retirementAge: 44, phase2SavingPercent: 100, phase2WorkPercent: 50 });
  d.groups[0].assumptions.monthlySaving = 500;
  const a = context(d);
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 60, w1: 50, w2: 100 }]);
  set(a, 'budgetData', { ...budget([{ ...income('b1', 'Gehalt', 1000), person: a.json('_ownPersonId()') }, { ...income('b2', 'Gehalt Kim', 600), person: 'p1' }]),
    fixe: [{ id: 'b3', name: 'Miete', subcat: '', kind: 'expense', targetGroupId: null, values: Array(12).fill(1100) }] });
  const r = simulate(a);
  near(assert, r.total[2], 10000 + 15 * 500 + 12 * 600, 1e-6, '500 € Sparen + 100 € Mehreinkommen');
  assert.match(a.run('_v2LtNotes(buildPlan())').replace(/ /g, ' '), /Ab 43 ist das Haushaltseinkommen 100 €\/Monat höher als heute\. Die Prognose legt 100 €\/Monat zusätzlich an/);
});
test('Arbeitszeit je Phase: Rentenpunkte wachsen nach der Arbeitszeit der Phase', () => {
  const a = context(fixture(undefined, { saveUntilAge: 60, retirementAge: 67, pensionStartAge: 67, planningHorizonAge: 90 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 67, points: 10, salary: 51944, w2: 50 }]);
  const r = a.json("calcDrvExtra(getLifetimeSettings(),getDrvExtra()[0])");
  // 41,75 → 60 voll (18,25 Punkte), 60 → 67 halb (3,5 Punkte) bei Durchschnittsentgelt
  near(assert, r.epTotal, 10 + 18.25 + 3.5, 1e-6);
});
test('Arbeitszeit je Phase: arbeitet die Person heute schon in Teilzeit, ist das Budget-Gehalt bereits das Teilzeitgehalt', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 20000 }], { monthlySpending: 1000, planningHorizonAge: 90 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 44, w1: 50, points: 10, salary: 51944 }]);
  salaryBudget(a, [{ ...income('b1', 'Gehalt Kim', 600), person: 'p1' }]);
  const r = simulate(a);
  near(assert, r.total[2], 20000 - 27 * 400, 1e-6, 'volle 600 € bis 44, nicht halbiert');
  near(assert, a.json("calcDrvExtra(getLifetimeSettings(),getDrvExtra()[0]).epTotal"), 10 + (44 - 41.75), 1e-6, 'Bruttogehalt ist schon das Teilzeitgehalt');
});
test('Arbeitszeit je Phase: Einkommenskarte zeigt das Gehalt je Abschnitt; die Prognose nennt die Sparlücke', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { saveUntilAge: 43, retirementAge: 44, pensionStartAge: 44, planningHorizonAge: 60, phase2SavingPercent: 100 });
  d.groups[0].assumptions.monthlySaving = 500;
  const a = context(d);
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1985, until: 50, w2: 50 }]);
  set(a, 'budgetData', { ...budget([income('b1', 'Gehalt', 1000), { ...income('b2', 'Gehalt Kim', 600), person: 'p1' }]),
    fixe: [{ id: 'b3', name: 'Miete', subcat: '', kind: 'expense', targetGroupId: null, values: Array(12).fill(1100) }] });
  const rows = a.json("_incomeCard(buildPlan()).rows.filter(r=>r.work).map(r=>[r.n,r.v,r.from,r.until])");
  assert.deepEqual(rows, [['Gehalt Kim', 600, 0, 43], ['Gehalt Kim (50 %)', 300, 43, 50]]);
  const note = a.run('_v2LtNotes(buildPlan())');
  assert.match(note.replace(/ /g, ' '), /Ab 43 ist das Haushaltseinkommen 300 €\/Monat niedriger als heute, während du noch arbeitest\. Was dann für die Sparraten fehlt \(300 €\/Monat\)/);
});
test('Altersvorsorge je Phase und Person: leer = solange die Person arbeitet, sonst der eingetragene Anteil', () => {
  const a = context(fixture(undefined, { saveUntilAge: 50, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 65 }]);
  set(a, 'lt-av-depots', [{ id: 'd1', name: 'Depot Kim', person: 'p1', contrib: 100 }]);
  // Kim (2 Jahre jünger) arbeitet bis 65, also bis zu deinem Alter 67: Beiträge bis zum Jahr ihres 64. Geburtstags
  const factor = y => a.json(`_avdParams(getLifetimeSettings(),getAvDepots()[0]).factor(${y})`);
  assert.deepEqual([factor(2030), factor(2051), factor(2052)], [1, 1, 0]);
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 65, pen2: 50, pen3: 0 }]);
  // Phase 2 (dein Alter 50–60 = Jahre 2035–2044) halb, Phase 3 (ab 2045) keine
  assert.deepEqual([factor(2030), factor(2040), factor(2046)], [1, 0.5, 0]);
});

/* ── Lebensphasen gesammelt im Phasen-Sheet der Prognose (Entscheidung 14.10.2026) ── */
test('Lebensphasen-Sheet: Arbeitszeit und Altersvorsorge je Person sowie Arbeitsende und Rentenbeginn werden dort gesetzt', () => {
  const a = context(fixture(undefined, { saveUntilAge: 50, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90, monthlySpending: 3000 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 67, points: 12, deduct: 20 }]);
  a.run('renderLifetimePageCalcs=()=>{}');
  a.run('openPhasesSheet()');
  const fill = v => { for (const [k, x] of Object.entries(v)) a.el(k).value = x; };
  fill({ 'lp-a2': '50', 'lp-a3': '60', 'lp-a4': '', 'lp-need3': '3.000', 'lp-need4': '', 'lpw-me-2': '80', 'lpv-me-3': '25',
    'lpw-p1-1': '50', 'lpw-p1-2': '100', 'lpv-p1-3': '0', 'lpp-p1-until': '65', 'lpp-p1-age': '64' });
  a.run('_savePhasesSheet()');
  const doc = a.json('appStorage.document()'), p = doc.retirement.people[0];
  assert.deepEqual([p.workUntilAge, p.phase1WorkPercent, p.phase2WorkPercent, p.phase3WorkPercent, p.phase3PensionPercent, p.statutoryPension.retirementAge, p.statutoryPension.points],
    [65, 50, 100, undefined, 0, 64, 12]);
  assert.deepEqual([doc.forecast.settings.phase1WorkPercent, doc.forecast.settings.phase2WorkPercent, doc.forecast.settings.phase3PensionPercent], [undefined, 80, 25]);
  // ungültige Arbeitszeit: nichts wird gespeichert
  const before = a.storage.getItem('vermoegen-data-v1');
  a.run('openPhasesSheet()');
  fill({ 'lp-a2': '50', 'lp-a3': '60', 'lp-need3': '3.000', 'lpw-p1-2': '120' });
  assert.throws(() => a.run('_savePhasesSheet()'), /Kim: Arbeitszeit \(Weiterarbeiten\)/);
  assert.equal(a.storage.getItem('vermoegen-data-v1'), before);
});
test('Haushaltskarte: Speichern der Karte behält die Phasenwerte aus dem Lebensphasen-Sheet', () => {
  const a = context(fixture());
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 65, w2: 50, pen3: 0, age: 64, points: 12 }]);
  const rows = a.json("_withPersonPhases([{id:'p1',name:'Kim B.',by:1987,points:13},{name:'Neu',by:1990}])");
  assert.deepEqual(rows[0], { id: 'p1', name: 'Kim B.', by: 1987, points: 13, until: 65, w2: 50, pen3: 0, age: 64 }, 'auch „0 %“ bleibt');
  assert.deepEqual(rows[1], { name: 'Neu', by: 1990 }, 'neue Person ohne Phasenwerte');
});
test('Lebensphasen-Sheet: Abschnitte sind zugeklappt, der gewählte ist offen; die Zusammenfassung steht im Kopf', () => {
  const a = context(fixture(undefined, { saveUntilAge: 50, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90, monthlySpending: 3000 }));
  set(a, 'lt-drv-extra', [{ id: 'p1', name: 'Kim', by: 1987, until: 67, w2: 50, points: 12 }]);
  a.run('requestAnimationFrame=()=>0;_openSheet=(t,body)=>{globalThis.__body=body;return true;};');
  const secs = () => [...a.json('__body').matchAll(/<details class="lp-sec" id="([^"]+)"( open)?/g)].map(m => [m[1], !!m[2]]);
  const open = () => secs().filter(x => x[1]).map(x => x[0]);
  a.run('openPhasesSheet()');
  assert.deepEqual(secs().map(x => x[0]), ['lp-sec-1', 'lp-sec-2', 'lp-sec-3', 'lp-sec-4', 'lp-sec-p-p1'], 'vier Phasen und Kim');
  assert.deepEqual(open(), []);
  // je Phase ein Feld je Person: du bis zum Weiterarbeiten, Kim in allen Phasen
  const ids = [...a.json('__body').matchAll(/id="(lp[wv]-[^"]+-\d)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['lpw-me-1', 'lpw-p1-1', 'lpw-me-2', 'lpw-p1-2', 'lpv-me-2', 'lpv-p1-2', 'lpw-p1-3', 'lpv-me-3', 'lpv-p1-3', 'lpw-p1-4', 'lpv-p1-4']);
  // Testumgebung ohne HTML-Parser: Eingaben wie im Sheet setzen, dann die Vorschau rechnen
  for (const [k, v] of Object.entries({ 'lp-a2': '50', 'lp-a3': '60', 'lp-need3': '3.000', 'lpp-p1-until': '67', 'lpw-p1-2': '50' })) a.el(k).value = v;
  a.run('_phasesPreview()');
  // Kim ist 2 Jahre jünger: Phase 2 beginnt mit ihren 48
  assert.equal(a.el('lp-s-p-p1').textContent, 'Vollzeit bis 48 · Teilzeit 50 % bis 67 · Rente ab 67');
  assert.match(a.el('lp-s-1').textContent, /^bis 50 · /);
  assert.equal(a.el('lp-s-2').textContent, 'bis 60 · Ich Vollzeit · Kim 50 % · Sparen 0 %');
  assert.equal(a.el('lp-s-3').textContent, 'bis 67 · Bedarf 3.000 € · Kim 50 %');
  assert.equal(a.el('lpw-p1-3').placeholder, '50', 'leer = wie in der Phase davor');
  a.run("openPhasesSheet('p-p1')");
  assert.deepEqual(open(), ['lp-sec-p-p1']);
  a.run('openPhasesSheet(3)');
  assert.deepEqual(open(), ['lp-sec-3']);
});
