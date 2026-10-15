/* Fachliche Regressionstests der Prognose: Geldflusserhaltung, Finanzierung, Zeitachse,
   Depotkapital, Liquidität und Ruhestandssuche. Die Sollwerte sind unabhängig vom Code
   mit einfacher Geldfluss-Arithmetik hergeleitet (Rendite, Schwankung, Inflation = 0). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, context, simulate, pension, near } = require('./forecast-fixture.cjs');

/* ── Block A: Finanzierung, Sparfähigkeit, Vermögenserhaltung ── */

test('controls: regular withdrawal without returns and a fully funded transfer keep the arithmetic', () => {
  // 1.000 € Cash, Bedarf 10 €/Monat ab heute (41,75): 3 Monate bis 42, dann je 12 Monate.
  const k2 = simulate(context(fixture(undefined, { monthlySpending: 10, pensionSpending: 10 })));
  assert.deepEqual(k2.total, [970, 850, 730]);
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 }, { id: 'house', group: 'House', cat: 'realEstate', value: 0 }]);
  d.forecast.events = [{ id: 'e', name: 'Kauf', year: 2027, amount: 1000, from: { type: 'group', groupId: 'g0' }, to: { type: 'group', groupId: 'g1' } }];
  const k3 = simulate(context(d));
  assert.equal(k3.total[1], 1000, 'eine finanzierte Umschichtung erhält das Vermögen');
  assert.equal(k3.short, null);
});

test('P18a: saving after the end of work is an internal transfer and creates no money', () => {
  const d = fixture();
  d.groups[0].assumptions.monthlySaving = 100;
  d.forecast.settings.phase3SavingPercent = 100;
  // Kein Einkommen, kein Bedarf: 100 €/Monat aus Cash in Cash verschoben → 1.000 € bleiben.
  assert.deepEqual(simulate(context(d)).total, [1000, 1000, 1000]);
  // Ziel in einer anderen Gruppe: Cash sinkt um genau den Betrag, um den der ETF steigt.
  const d2 = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 }, { id: 'etf', group: 'ETF', cat: 'etf', value: 0 }]);
  d2.groups[1].assumptions.monthlySaving = 100;
  d2.forecast.settings.phase3SavingPercent = 100;
  const r = simulate(context(d2));
  // Entnommen wird anteilig aus allen freien Anlagen; die Summe bleibt exakt erhalten.
  assert.deepEqual(r.total.map(v => Math.round(v * 1e6) / 1e6), [1000, 1000, 1000]);
  assert.ok(r.per[r.keys.indexOf('ETF')][2] > r.per[r.keys.indexOf('ETF')][0], 'der ETF wächst durch die Umschichtung');
  assert.equal(r.short, null);
});

/* P18b ging davon aus, dass im Vorruhestand weiter in ein Altersvorsorgedepot eingezahlt werden kann (Vorsorge-Anteil der
   Phase), und verlangte, dass diese Beiträge aus dem Vermögen kommen. Seit 15.10.2026 gilt fachlich: Nach dem Ende der
   Arbeit fließen weder Beiträge noch Zulagen in das Depot (keine Förderberechtigung ohne Beschäftigung); das angesparte
   Kapital verzinst sich weiter. Der Fall prüft deshalb, dass nichts mehr abfließt. */
test('P18b (15.10.2026): after the end of work nothing flows into a retirement depot, even with a pension share in early retirement', () => {
  const d = fixture();
  d.forecast.settings.phase3PensionPercent = 100;
  d.retirement.pensionDepots = [{ id: 'dep', name: 'Depot', personId: 'person-main', monthlyContribution: 150, payoutAge: 65, returnPercent: 0, deductionPercent: 0 }];
  const r = simulate(context(d));
  assert.equal(r.short, null, 'kein Fehlbetrag durch Depotbeiträge');
  assert.deepEqual(r.total.map(v => Math.round(v * 1e6) / 1e6), [1000, 1000, 1000], 'Cash bleibt unangetastet');
});

test('P22: an under-funded purchase moves only the funded part and fails', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100 }, { id: 'house', group: 'House', cat: 'realEstate', value: 0 }]);
  d.forecast.events = [{ id: 'e', name: 'Kauf', year: 2027, amount: 1000, from: { type: 'group', groupId: 'g0' }, to: { type: 'group', groupId: 'g1' } }];
  const r = simulate(context(d));
  assert.equal(r.total[1], 100, 'kein zusätzliches Kapital aus einer nicht finanzierten Umschichtung');
  assert.equal(r.per[r.keys.indexOf('House')][1], 100);
  assert.ok(r.short !== null);
});

test('P24: a household deficit is withdrawn from assets instead of hidden behind planned savings', () => {
  const d = fixture(undefined, { retirementAge: 60, saveUntilAge: 60 });
  d.groups[0].assumptions.monthlySaving = 500;
  const a = context(d);
  a.run("saveBudgetData({einkommen:[{name:'Gehalt',kind:'income',values:Array(12).fill(1000)}],fixe:[{name:'Kosten',kind:'expense',values:Array(12).fill(1200)}],variable:[],sparen:[{name:'Cash-Sparen',kind:'saving',targetGroupId:'g0',values:Array(12).fill(500)}],oneTime:[],accounts:{},standingOrders:[]});");
  // Einnahmen 1.000 − Kosten 1.200 = −200 €/Monat; die 500 € Sparen sind eine Umbuchung → netto −200 €/Monat.
  const r = simulate(a);
  assert.equal(r.total[0], 1000 - 3 * 200);
  assert.ok(r.short !== null && r.short > 42 && r.short <= 42.5, 'Fehlbetrag im 6. Monat, war ' + r.short);
  // Ein ausgeglichenes Budget finanziert dieselbe Sparrate vollständig.
  a.run("saveBudgetData({einkommen:[{name:'Gehalt',kind:'income',values:Array(12).fill(3000)}],fixe:[{name:'Kosten',kind:'expense',values:Array(12).fill(1200)}],variable:[],sparen:[{name:'Cash-Sparen',kind:'saving',targetGroupId:'g0',values:Array(12).fill(500)}],oneTime:[],accounts:{},standingOrders:[]});");
  assert.deepEqual(simulate(a).total.slice(0, 3), [2500, 8500, 14500]);
  // Die Prognose weist die Lücke aus.
  a.run("saveBudgetData({einkommen:[{name:'Gehalt',kind:'income',values:Array(12).fill(1000)}],fixe:[{name:'Kosten',kind:'expense',values:Array(12).fill(1200)}],variable:[],sparen:[],oneTime:[],accounts:{},standingOrders:[]});");
  assert.equal(a.json('buildPlan().funding.gap'), 700);
});

/* ── Block B: Depotkapital, Liquidität, Budgetbeiträge ── */

function depotFixture(extra) {
  const rows = [{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 },
    { id: 'd1', group: 'Altersvorsorgedepots', cat: 'etf', liq: 'illiquid', value: 10000 }, ...extra];
  const d = fixture(rows, { planningHorizonAge: 72, saveUntilAge: 60, retirementAge: 60, pensionStartAge: 67 });
  d.retirement.pensionDepots = [{ id: 'dep1', name: 'Eins', personId: 'person-main', monthlyContribution: 0, positionId: 'd1', payoutAge: 65, returnPercent: 0, deductionPercent: 0 }];
  return d;
}

test('P19a: each depot converts at its own payout age; the other keeps its capital', () => {
  const d = depotFixture([{ id: 'd2', group: 'Altersvorsorgedepots', cat: 'etf', liq: 'illiquid', value: 20000 }]);
  d.retirement.pensionDepots.push({ id: 'dep2', name: 'Zwei', personId: 'person-main', monthlyContribution: 0, positionId: 'd2', payoutAge: 70, returnPercent: 0, deductionPercent: 0 });
  const r = simulate(context(d));
  // Depot 1: 10.000 € auf 240 Monate (65–85) = 500 €/Jahr. Mit 66: 1.000 + 500 + 20.000.
  assert.equal(r.total[66 - r.first], 21500);
  // Mit 71: Depot 2 zahlt seit 70 aus: 20.000 / 180 Monate × 12 = 1.333,33 €; Depot 1: 6 × 500.
  near(assert, r.total[71 - r.first], 1000 + 6 * 500 + 20000 / 15, 1e-6);
});

test('P19b: in a mixed group only the depot capital becomes the payout', () => {
  const d = depotFixture([{ id: 'etf2', group: 'Altersvorsorgedepots', cat: 'etf', liq: 'illiquid', value: 1000 }]);
  const r = simulate(context(d));
  near(assert, r.total[66 - r.first], 1000 + 500 + 1000, 1e-6);
});

test('P19: a payout that already started is paid from the current balance until 85', () => {
  const d = depotFixture([]);
  d.retirement.primary.birthYear = 1958; // heute 68,75: Auszahlung seit 65 läuft
  d.forecast.settings.planningHorizonAge = 72;
  const r = simulate(context(d));
  // 10.000 € auf die restlichen 16,25 Jahre (195 Monate) bis 85 verteilt.
  near(assert, r.total[70 - r.first], 1000 + 10000 / 195 * 15, 1e-6);
});

test('P20: a locked position does not lock the liquid part of the same group', () => {
  const d = fixture([{ id: 'open', group: 'ETF', cat: 'etf', value: 30000 }, { id: 'locked', group: 'ETF', cat: 'etf', liq: 'illiquid', value: 1000 }],
    { monthlySpending: 100, pensionSpending: 100 });
  const a = context(d);
  assert.equal(a.json('(()=>{const p=buildPlan();return runMonteCarlo(p,p.s.withdrawFrom,false).success;})()'), 1);
  const r = simulate(a);
  assert.deepEqual(r.total, [31000 - 300, 31000 - 1500, 31000 - 2700]);
  assert.deepEqual(r.avail, [30000 - 300, 30000 - 1500, 30000 - 2700], 'nur der freie Teil ist entnehmbar');
});

test('P26: a budget item linked to a depot stays until the depot actually collects contributions', () => {
  const a = context(fixture(undefined, { retirementAge: 60, saveUntilAge: 60 }));
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'dep',name:'Depot',contrib:150,start:2027}]));saveBudgetData({einkommen:[],fixe:[],variable:[],sparen:[{id:'save',name:'Depot',kind:'saving',values:Array(12).fill(150),depotId:'dep'}],oneTime:[],accounts:{},standingOrders:[]});");
  a.run("selectedMonth='2026-10'");
  assert.equal(a.json('calcBudgetMonth(loadBudgetData(),9).sparplaene'), 150);
  a.run("selectedMonth='2027-03'");
  const c = a.json('calcBudgetMonth(loadBudgetData(),2)');
  assert.equal(c.sparItems.filter(i => i.id === 'save').length, 0, '2027 ersetzt die Depotzeile den Posten');
  assert.ok(c.sparItems.some(i => i.depot && /Beitrag/.test(i.label)));
});

/* ── Block C: Zeitachse, Ruhestandssuche, Ergebnisdarstellung ── */

test('P21a: retirement at a fractional age starts the need in that month', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { saveUntilAge: 42.5, retirementAge: 42.5, monthlySpending: 1000, pensionSpending: 1000 });
  assert.equal(simulate(context(d)).total[1], 4000);
});

test('P21b: an income from 42.5 covers the need from exactly that month', () => {
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { monthlySpending: 1000, pensionSpending: 1000 }));
  pension(a, 1000, 42.5);
  const r = simulate(a);
  [7000, 1000, 1000].forEach((v, i) => near(assert, r.total[i], v, 1e-6));
  assert.equal(r.short, null);
});

test('P21c: capital that becomes available only at 42 does not pay the need before', () => {
  const d = fixture([{ id: 'locked', group: 'Locked', cat: 'etf', value: 3000 }], { planningHorizonAge: 43, monthlySpending: 1000, pensionSpending: 0, pensionStartAge: 42 });
  d.groups[0].assumptions.availableFromAge = 42;
  const r = simulate(context(d));
  assert.ok(r.short !== null && r.short <= 42, 'Fehlbetrag vor der Freigabe, war ' + r.short);
});

test('P13: an event of the current year is still applied after July', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100000 }]);
  d.forecast.events = [{ id: 'e', name: 'Dezember-Ausgabe', year: 2026, amount: 50000, from: { type: 'liquid' }, to: { type: 'external' } }];
  assert.equal(simulate(context(d)).total[0], 50000);
});

test('P28: a future snapshot is not today’s starting wealth', () => {
  const d = fixture();
  d.snapshots.push({ month: '2040-01', positions: [{ positionId: 'cash', value: 1000000 }] });
  const a = context(d);
  assert.equal(a.json('buildPlan().latestNet'), 1000);
  assert.equal(a.json('buildPlan().latestKey'), '2026-10');
});

test('P17: the birth month sets the exact age and the phase boundaries', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }], { saveUntilAge: 42, retirementAge: 42, monthlySpending: 1000, pensionSpending: 1000, planningHorizonAge: 45 });
  d.retirement.primary.birthMonth = 12; // Dezember 1985 → am 08.10.2026: 40 Jahre 10 Monate
  const a = context(d);
  near(assert, a.json('buildPlan().currentAge'), 40 + 10 / 12);
  const r = simulate(a);
  // Bis 42 wird gearbeitet, danach 1.000 €/Monat: mit 43 sind 12.000 € fällig → Fehlbetrag mit 42 + 10 Monaten.
  assert.equal(r.total[r.first === 41 ? 1 : 0], 10000, 'bis 42 unverändert');
  assert.ok(r.short !== null && r.short > 42.8 && r.short <= 42.9);
});

test('P23: no safe retirement at the planning horizon without a single retired month', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100 }], { planningHorizonAge: 45, monthlySpending: 1000, pensionSpending: 1000 });
  assert.equal(context(d).json('findRetireAge(buildPlan())'), null);
});

test('P9: every search candidate gets its own pension and the earliest feasible age is found', () => {
  // Kein Zufall: Erfolg ist 0 oder 1. Gesetzliche Rente aus Durchschnittsgehalt (1 Punkt je Arbeitsjahr).
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 0 }],
    { saveUntilAge: 66, retirementAge: 66, pensionStartAge: 67, planningHorizonAge: 95, monthlySpending: 1500, pensionSpending: 1500 });
  d.groups[0].assumptions.monthlySaving = 1000;
  d.retirement.primary.statutoryPension = { points: 10, annualSalary: 51944, deductionPercent: 0, pensionPointValue: 42.52, averageSalary: 51944, contributionCeiling: 101400 };
  const a = context(d);
  // Unabhängige Rechnung je Kandidat A (ganze Jahre): Vermögen bei Ruhestand = 1.000 × Monate Arbeit;
  // Bedarf bis 67: 1.500 × Monate; danach fehlt 1.500 − Rente(A) bis 95; Rente(A) = (10 + Arbeitsjahre) × 42,52.
  const feasible = A => {
    const work = (A - 41.75) * 12, rent = (10 + (A - 41.75)) * 42.52;
    const wealth = 1000 * work - 1500 * (67 - A) * 12 - Math.max(0, 1500 - rent) * (95 - 67) * 12;
    return wealth >= -1e-6;
  };
  let expected = null; for (let A = 42; A <= 94; A++) if (feasible(A)) { expected = A; break; }
  assert.equal(a.json('findRetireAge(buildPlan())'), expected);
});

test('search: a later retirement that is worse does not hide an earlier safe age', () => {
  // Hohe Entnahme beim Weiterarbeiten: später aufhören verbraucht mehr Vermögen.
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100000 }],
    { saveUntilAge: 41.75, retirementAge: 50, pensionStartAge: 50, planningHorizonAge: 60, monthlySpending: 100, pensionSpending: 100, phase2MonthlyWithdrawal: 1000 });
  const a = context(d);
  // Ruhestand mit 42: 0,25 Jahre Entnahme 1.000 + 18 Jahre Bedarf 100 → reicht. Mit 59: 17,25 Jahre × 12.000 → reicht nicht.
  assert.equal(a.json('findRetireAge(buildPlan())'), 42);
});

test('P27: a fully covered need with a small reserve is not shown as used up', () => {
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 500 }], { pensionStartAge: 41.75, monthlySpending: 1000, pensionSpending: 1000 });
  const a = context(d); pension(a, 1000, 40);
  const res = a.json('(()=>{const p=buildPlan(),mc=runMonteCarlo(p,p.s.withdrawFrom,true);_v2LtPhases({s:p.s,plan:p,mc,currentAge:p.currentAge,infl:0});return {success:mc.success,warning:document.getElementById("v2-lt-phases").innerHTML.includes("aufgebraucht")||document.getElementById("v2-lt-phases").innerHTML.includes("Fehlbetrag")};})()');
  assert.deepEqual(res, { success: 1, warning: false });
  // Reicht das Geld nicht, nennt die Karte das Alter des Fehlbetrags.
  const d2 = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 5000 }], { pensionStartAge: 41.75, monthlySpending: 1000, pensionSpending: 1000 });
  const b = context(d2);
  const html = b.json('(()=>{const p=buildPlan(),mc=runMonteCarlo(p,p.s.withdrawFrom,true);_v2LtPhases({s:p.s,plan:p,mc,currentAge:p.currentAge,infl:0});return document.getElementById("v2-lt-phases").innerHTML;})()');
  assert.match(html, /Fehlbetrag/);
});

/* P7: „Heute“ ist intern der Folgemonat (Live-Stand). Das Budget plant trotzdem den laufenden Kalendermonat. */
test('P7: the budget of “today” is the current calendar month, not the live snapshot month', () => {
  const a = context(fixture());
  a.run("selectedMonth=nextYM();");
  assert.equal(a.json('nextYM()'), '2026-11');
  assert.equal(a.json('_budgetYM()'), '2026-10', 'harness date 8 Oct 2026');
  a.run("selectedMonth='2026-09';");
  assert.equal(a.json('_budgetYM()'), '2026-09', 'an older month stays that month');
});
