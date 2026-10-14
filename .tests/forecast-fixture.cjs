/* Kleine, vollständig kontrollierte Prognose-Haushalte für fachliche Regressionstests.
   Rendite, Schwankung, Inflation und Entnahmeabzug sind 0, damit jede Erwartung mit
   einfacher Geldfluss-Arithmetik nachgerechnet werden kann. Harness-Datum: 08.10.2026,
   geboren Januar 1985 → heutiges Alter 41,75 (Monat 0 = Oktober 2026). */
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
/* APP_HTML=<Pfad> rechnet dieselben Tests gegen einen älteren Stand von index.html (Nachweis, dass ein Test den
   Fehler vor der Behebung erkennt), z. B. git show 7504901:index.html > /tmp/alt.html */
const html = fs.readFileSync(process.env.APP_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');

function fixture(rows = [{ id: 'cash', group: 'Cash', cat: 'cash', value: 1000 }], settings = {}) {
  const d = Data.empty();
  d.groups = [...new Set(rows.map(p => p.group))].map((name, i) => ({
    id: 'g' + i, name,
    assumptions: { returnPercent: 0, volatilityPercent: 0, monthlySaving: 0, availableFromAge: 0, withdrawalDeductionPercent: 0 }
  }));
  d.positions = rows.map(p => ({ id: p.id, name: p.id, category: p.cat, groupId: d.groups.find(g => g.name === p.group).id,
    archived: false, custom: true, ticker: null, unit: null, valuation: 'manual',
    liquidity: p.liq || (['realEstate', 'vehicle', 'illiquid', 'bav'].includes(p.cat) ? 'illiquid' : 'liquid') }));
  d.snapshots = [{ month: '2026-10', positions: rows.map(p => ({ positionId: p.id, value: p.value })) }];
  d.retirement.primary.birthYear = 1985;
  d.forecast.settings = { inflationPercent: 0, planningHorizonAge: 44, saveUntilAge: 41.75, retirementAge: 41.75,
    pensionStartAge: 50, monthlySpending: 0, pensionSpending: 0, ...settings };
  return d;
}
function context(d, storage) {
  Data.validate(d);
  return app(html, storage || new MemoryStorage({ [Data.KEY]: JSON.stringify(d) }));
}
/* Erwartungspfad (ohne Zufall): Werte zu den ganzen Altersjahren 42, 43, … */
function simulate(a, retireAge) {
  return a.json(`(()=>{const p=buildPlan(),R=${retireAge === undefined ? 'p.s.withdrawFrom' : retireAge},r=simulatePlan(p,R,{record:true});
    return {first:p.firstAge,total:[...r.total],avail:[...r.avail],short:r.shortfallAge,per:r.per.map(x=>[...x]),keys:p.groups.map(g=>g.key)};})()`);
}
function pension(a, amount, from, until) {
  a.context.fxPension = [{ name: 'Einkommen', amount, from, ...(until !== undefined ? { until } : {}) }];
  a.run("appStorage.setItem('lt-pensions',JSON.stringify(fxPension));");
}
const near = (assert, actual, expected, eps = 1e-6, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, (msg ? msg + ': ' : '') + actual + ' ≠ ' + expected);

module.exports = { fixture, context, simulate, pension, near, html, Data, MemoryStorage, app };
