/* Read-only financial audit of the real app script, with independent cash-flow
 * expectations. Run: node .scripts/audit-forecast.cjs
 * Exit 1 means confirmed discrepancies; this is not part of the regular suite.
 * All parameter edits use MemoryStorage. No portfolio or demo file is written.
 */
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('../.tests/app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const results = [];

// FixedDate in the existing harness: 2026-10-08. Born January 1985: 41.75.
function fixture(rows = [{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 }], settings = {}) {
  const d = Data.empty();
  d.groups = [...new Set(rows.map(p => p.group))].map((name, i) => ({
    id: 'g' + i, name,
    assumptions: { returnPercent: 0, volatilityPercent: 0, monthlySaving: 0,
      availableFromAge: 0, withdrawalDeductionPercent: 0 }
  }));
  d.positions = rows.map(p => ({ id: p.id, name: p.id, category: p.cat,
    groupId: d.groups.find(g => g.name === p.group).id, archived: false,
    custom: true, ticker: null, unit: null, valuation: 'manual',
    liquidity: p.liq || (p.cat === 'realEstate' ? 'illiquid' : 'liquid') }));
  d.snapshots = [{ month: '2026-10', positions: rows.map(p => ({ positionId: p.id, value: p.value })) }];
  d.retirement.primary.birthYear = 1985;
  d.forecast.settings = { inflationPercent: 0, planningHorizonAge: 44,
    saveUntilAge: 41.75, retirementAge: 41.75, pensionStartAge: 50,
    monthlySpending: 0, pensionSpending: 0, ...settings };
  return d;
}
function context(d) {
  Data.validate(d);
  return app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(d) }));
}
function simulate(a) {
  return a.json('(()=>{const p=buildPlan(),r=simulatePlan(p,p.s.withdrawFrom,{record:true});return {first:p.firstAge,total:[...r.total],short:r.shortfallAge,loanOut:[...r.loanOut]};})()');
}
function pension(a, amount, from) {
  a.context.auditPension = [{ name: 'Independent income', amount, from }];
  a.run("appStorage.setItem('lt-pensions',JSON.stringify(auditPension));");
}
function equal(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => equal(a[k], b[k]));
  }
  return a === b;
}
function check(id, scenario, actual, expected, evidence) {
  results.push({ id, scenario, status: equal(actual, expected) ? 'OK' : 'ABWEICHUNG', actual, expected,
    ...(evidence ? { evidence } : {}) });
}

// Controls: ordinary totals, regular withdrawals and a funded internal transfer.
{
  const a = context(fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 3000 },
    { id: 'house', group: 'House', cat: 'realEstate', value: 10000 },
    { id: 'loan', group: 'Debt', cat: 'liab', value: 4000 }]));
  check('K1', 'Brutto minus Schulden', a.json("calc(loadData()['2026-10']).net"), 9000);
}
{
  const a = context(fixture(undefined, { monthlySpending: 10, pensionSpending: 10 }));
  check('K2', 'Regelmaessige Entnahme ohne Rendite/Inflation', simulate(a).total, [970, 850, 730]);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 },
    { id: 'house', group: 'House', cat: 'realEstate', value: 0 }]);
  d.forecast.events = [{ id: 'event', name: 'Funded transfer', year: 2027, amount: 1000,
    from: { type: 'group', groupId: 'g0' }, to: { type: 'group', groupId: 'g1' } }];
  check('K3', 'Finanzierte Umschichtung erhaelt Vermoegen', simulate(context(d)).total[1], 1000);
}

{
  const d = fixture();
  d.groups[0].assumptions.monthlySaving = 100;
  d.forecast.settings.phase3SavingPercent = 100;
  check('P18a', 'Private Beitraege ohne Einkommen im Vorruhestand', simulate(context(d)).total, [1000, 1000, 1000]);
}
{
  const d = fixture();
  d.forecast.settings.phase3PensionPercent = 100;
  d.retirement.pensionDepots = [{ id: 'dep', name: 'Depot', personId: 'person-main',
    monthlyContribution: 150, payoutAge: 65, returnPercent: 0, deductionPercent: 0 }];
  const a = context(d);
  // This year's phase is entirely Vorruhestand. Since 15.10.2026: after the end of work neither own contributions nor
  // subsidies flow into a retirement depot (no eligibility without employment), even with a pension share for the phase;
  // previously this case expected 1800 € to be paid from 1000 € cash. Now nothing is due and cash stays untouched.
  const actual = a.json('(()=>{const s=getLifetimeSettings(),z=avdYear(s,getAvDepots()[0],2027),p=buildPlan();return {own:z?z.own:0,cashAt43:simulatePlan(p,s.withdrawFrom).total[1],ownSum:p.avd[0]?p.avd[0].ownSum:0,capReal:p.avd[0]?p.avd[0].capReal:0};})()');
  check('P18b', 'Kein AV-Eigenbeitrag nach dem Arbeitsende; Cash bleibt 1000', actual.own === 0 && actual.ownSum === 0 && actual.cashAt43 === 1000, true, actual);
}

{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 },
    { id: 'd1', group: 'Altersvorsorgedepots', cat: 'etf', liq: 'illiquid', value: 10000 },
    { id: 'd2', group: 'Altersvorsorgedepots', cat: 'etf', liq: 'illiquid', value: 20000 }],
  { planningHorizonAge: 72, saveUntilAge: 60, retirementAge: 60, pensionStartAge: 67 });
  d.retirement.pensionDepots = [
    { id: 'dep1', name: 'One', personId: 'person-main', monthlyContribution: 0,
      positionId: 'd1', payoutAge: 65, returnPercent: 0, deductionPercent: 0 },
    { id: 'dep2', name: 'Two', personId: 'person-main', monthlyContribution: 0,
      positionId: 'd2', payoutAge: 70, returnPercent: 0, deductionPercent: 0 }
  ];
  const r = simulate(context(d));
  check('P19a', 'Zweites Depot bleibt bis 70 erhalten; erstes zahlt 500/Jahr', r.total[66 - r.first], 21500);
  d.positions.pop(); d.snapshots[0].positions.pop();
  d.retirement.pensionDepots.pop();
  d.positions.push({ ...d.positions[1], id: 'extra', name: 'Ordinary asset' });
  d.snapshots[0].positions.push({ positionId: 'extra', value: 1000 });
  const mix = simulate(context(d));
  check('P19b', 'Gemischte Gruppe: nur Depotkapital wird in Auszahlplan umgewandelt', mix.total[66 - mix.first], 2500);
}

{
  const d = fixture([{ id: 'open', group: 'ETF', cat: 'etf', value: 30000 },
    { id: 'locked', group: 'ETF', cat: 'etf', liq: 'illiquid', value: 1000 }],
  { monthlySpending: 100, pensionSpending: 100 });
  check('P20', 'Liquider ETF bleibt neben gebundenem ETF entnehmbar', context(d).json('(()=>{const p=buildPlan();return runMonteCarlo(p,p.s.withdrawFrom,false).success;})()'), 1);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }],
    { saveUntilAge: 42.5, retirementAge: 42.5, monthlySpending: 1000, pensionSpending: 1000 });
  check('P21a', 'Sechs Monate Bedarf ab Alter 42.5', simulate(context(d)).total[1], 4000);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 10000 }],
    { monthlySpending: 1000, pensionSpending: 1000 });
  const a = context(d); pension(a, 1000, 42.5);
  check('P21b', 'Einkommen ab 42.5 deckt Bedarf ab dieser Grenze', simulate(a).total, [7000, 1000, 1000]);
}
{
  const d = fixture([{ id: 'locked', group: 'Locked', cat: 'etf', value: 3000 }],
    { planningHorizonAge: 43, monthlySpending: 1000, pensionSpending: 0, pensionStartAge: 42 });
  d.groups[0].assumptions.availableFromAge = 42;
  check('P21c', 'Bis Alter 42 gesperrtes Kapital deckt keinen Bedarf davor', simulate(context(d)).short !== null, true);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100 },
    { id: 'house', group: 'House', cat: 'realEstate', value: 0 }]);
  d.forecast.events = [{ id: 'event', name: 'Unfunded purchase', year: 2027, amount: 1000,
    from: { type: 'group', groupId: 'g0' }, to: { type: 'group', groupId: 'g1' } }];
  check('P22', 'Nicht finanzierte interne Transaktion erzeugt kein Kapital', simulate(context(d)).total[1], 100);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 100 }],
    { planningHorizonAge: 45, monthlySpending: 1000, pensionSpending: 1000 });
  check('P23', 'Kein sicherer Ruhestand mit Null-Dauer am Horizont', context(d).json('findRetireAge(buildPlan())'), null);
}
{
  const d = fixture(undefined, { retirementAge: 60, saveUntilAge: 60 });
  d.groups[0].assumptions.monthlySaving = 500;
  const a = context(d);
  a.run("saveBudgetData({einkommen:[{name:'Salary',kind:'income',values:Array(12).fill(1000)}],fixe:[{name:'Costs',kind:'expense',values:Array(12).fill(1200)}],variable:[],sparen:[{name:'Cash saving',kind:'saving',targetGroupId:'g0',values:Array(12).fill(500)}],oneTime:[],accounts:{},standingOrders:[]});");
  // A gap of 700/mo = 200 of unfunded living costs + 500 of planned savings.
  const r = simulate(a);
  check('P24', 'Negatives Haushaltsbudget finanziert keinen Vermoegenszuwachs', r.total[1] > 1000, false,
    { free: a.json('calcBudgetMonth(loadBudgetData(),9).frei'), cashAt43: r.total[1] });
}
{
  const a = context(fixture());
  check('P25a', 'Kinderzulage 300 Euro Eigenbeitrag, zwei Kinder', a.json('avdSubsidy(300,2).child'), 600);
  const working = context(fixture(undefined, { retirementAge: 60, saveUntilAge: 60 }));
  working.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'d1',name:'A',contrib:150,kids:'2019'},{id:'d2',name:'B',contrib:150,kids:'2019'}]));");
  check('P25b', 'Foerderung derselben Person nicht pro Depot vervielfachen', working.json('getAvDepots().reduce((sum,d)=>sum+avdYear(getLifetimeSettings(),d,2027).total,0)'), 840);
  check('P25c', '100 Euro Jahresbeitrag unterschreitet Mindesteigenbeitrag', working.json('avdYear(getLifetimeSettings(),{contrib:100/12},2027).total'), 0);
}
{
  const a = context(fixture());
  a.run("appStorage.setItem('lt-av-depots',JSON.stringify([{id:'dep',name:'Depot',contrib:150,start:2027}]));saveBudgetData({einkommen:[],fixe:[],variable:[],sparen:[{id:'save',name:'Depot',kind:'saving',values:Array(12).fill(150),depotId:'dep'}],oneTime:[],accounts:{},standingOrders:[]});selectedMonth='2026-10';");
  check('P26', 'Verknuepfter Budgetbeitrag vor Beginn des Depots bleibt bestehen', a.json('calcBudgetMonth(loadBudgetData(),9).sparplaene'), 150);
}
{
  const d = fixture([{ id: 'cash', group: 'Cash', cat: 'cash', value: 500 }],
    { pensionStartAge: 41.75, monthlySpending: 1000, pensionSpending: 1000 });
  const a = context(d); pension(a, 1000, 40);
  const actual = a.json('(()=>{const p=buildPlan(),mc=runMonteCarlo(p,p.s.withdrawFrom,true);_v2LtPhases({s:p.s,plan:p,mc,currentAge:p.currentAge,infl:0});return {success:mc.success,warning:document.getElementById("v2-lt-phases").innerHTML.includes("aufgebraucht")};})()');
  check('P27', 'Voll gedeckter Bedarf, 500 Euro bleiben: nicht aufgebraucht', actual, { success: 1, warning: false });
}
{
  const d = fixture();
  d.snapshots.push({ month: '2040-01', positions: [{ positionId: 'cash', value: 1000000 }] });
  check('P28', 'Zukuenftiger Snapshot ist kein Vermoegen heute', context(d).json('buildPlan().latestNet'), 1000);
}
{
  const d = fixture(undefined, { saveUntilAge: 62.75, retirementAge: 62.75, pensionStartAge: 63 });
  d.retirement.primary.birthYear = 1964;
  const a = context(d);
  check('P29a', 'Keine regulaere Bundesbeamtenpension nach nur vier Dienstjahren',
    a.json('calcBeamtePension(getLifetimeSettings(),{pay:4000,years:4,age:67,from:63,deduct:0}).netto'), 0);
  check('P29b', 'Bund: Antrag mit 63, Regelgrenze 67, Abschlag 14.4 Prozent',
    a.json('calcBeamtePension(getLifetimeSettings(),{pay:4000,years:40,age:67,from:63,deduct:0}).netto'), 4000 * 0.7175 * 0.856);
}

const demo = context(JSON.parse(fs.readFileSync(path.join(root, 'demo_backup.json'), 'utf8')));
const demoSummary = demo.json('(()=>{const p=buildPlan();return {latestKey:p.latestKey,currentAge:p.currentAge,success:runMonteCarlo(p,p.s.withdrawFrom,false).success,retireAge:findRetireAge(p)};})()');
const discrepancies = results.filter(r => r.status === 'ABWEICHUNG').length;
console.log(JSON.stringify({ fixedDate: '2026-10-08', demo: demoSummary,
  checks: results.length, discrepancies, results }, null, 2));
process.exitCode = discrepancies ? 1 : 0;
