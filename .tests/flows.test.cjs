/* Block E: Aufteilung der Vermögensentwicklung in Einzahlungen, Kursentwicklung und Sonstiges (calcFlows).
   P2: das Merkmal „Stückzahl erfassbar“ ohne erfasste Stückzahl darf Konten nicht aus der Sparleistung nehmen.
   P8: ein Kredit in eigener Gruppe gehört zur Gruppe des finanzierten Vermögenswerts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { context, Data } = require('./forecast-fixture.cjs');

/* rows: {id, cat, group, units?, liq?, values:{month:value}, qty:{month:quantity}} */
function doc(rows, loans = []) {
  const d = Data.empty();
  d.groups = [...new Set(rows.map(r => r.group))].map((name, i) => ({ id: 'g' + i, name,
    assumptions: { returnPercent: 0, volatilityPercent: 0, monthlySaving: 0, availableFromAge: 0, withdrawalDeductionPercent: 0 } }));
  d.positions = rows.map(r => ({ id: r.id, name: r.id, category: r.cat, groupId: d.groups.find(g => g.name === r.group).id,
    archived: false, custom: true, ticker: null, unit: r.units ? { name: 'Stück', key: r.id } : null, valuation: 'manual',
    liquidity: r.liq || (['realEstate', 'vehicle', 'illiquid', 'bav', 'liab'].includes(r.cat) ? 'illiquid' : 'liquid') }));
  const months = [...new Set(rows.flatMap(r => Object.keys(r.values)))].sort();
  d.snapshots = months.map(month => ({ month, positions: rows.filter(r => month in r.values).map(r => ({ positionId: r.id, value: r.values[month],
    ...(r.qty && month in r.qty ? { quantity: r.qty[month] } : {}) })) }));
  d.loans = loans;
  d.retirement.primary.birthYear = 1985;
  return d;
}
const flows = (a, from, to, group) => a.json(`(()=>{const r=calcFlows(${JSON.stringify(from)},${JSON.stringify(to)}${group ? ',' + JSON.stringify(group) : ''});return{flow:r.flow,inflow:r.inflow,outflow:r.outflow,market:r.market,other:r.other};})()`);

test('P2: Einzahlung auf ein Konto mit „Stückzahl erfassbar“, aber ohne Stückzahl, ist Sparleistung', () => {
  const a = context(doc([{ id: 'konto', cat: 'cash', group: 'Cash', units: true, values: { '2026-08': 1000, '2026-09': 1500, '2026-10': 1800 } }]));
  const r = flows(a, '2026-08', '2026-10');
  assert.equal(r.inflow, 800); assert.equal(r.other, 0); assert.equal(r.market, 0);
});
test('P2: Kontrolle – mit erfasster Stückzahl bleibt die Aufteilung in Kauf und Kursentwicklung', () => {
  // 10 Stück à 100 € → 12 Stück à 110 €: Kauf 2 × 110 = 220 €, Kursentwicklung 1.320 − 1.000 − 220 = 100 €
  const a = context(doc([{ id: 'etf', cat: 'etf', group: 'ETF', units: true, values: { '2026-09': 1000, '2026-10': 1320 }, qty: { '2026-09': 10, '2026-10': 12 } }]));
  const r = flows(a, '2026-09', '2026-10');
  assert.equal(r.inflow, 220); assert.ok(Math.abs(r.market - 100) < 1e-9); assert.equal(r.other, 0);
});
test('P2: Kauf eines Sachwerts aus dem Konto ist eine Umschichtung, kein Vermögenszuwachs und keine Entnahme', () => {
  const a = context(doc([
    { id: 'konto', cat: 'cash', group: 'Cash', units: true, values: { '2026-09': 50000, '2026-10': 10000 } },
    { id: 'auto', cat: 'vehicle', group: 'Sachwerte', units: false, values: { '2026-10': 40000 } }]));
  const r = flows(a, '2026-09', '2026-10');
  assert.equal(r.flow, 0); assert.equal(r.other, 0);
});
test('P8: Kredit in eigener Gruppe – der kreditfinanzierte Kauf ist auch in der Gruppe des Vermögenswerts neutral', () => {
  const rows = [
    { id: 'garage', cat: 'realEstate', group: 'Immobilien', units: true, values: { '2025-12': 0, '2026-01': 60000, '2026-02': 60000 } },
    { id: 'kredit', cat: 'liab', group: 'Kredit Garagen', values: { '2025-12': 0, '2026-01': 60000, '2026-02': 59700 } },
    { id: 'konto', cat: 'cash', group: 'Cash', values: { '2025-12': 5000, '2026-01': 5000, '2026-02': 4700 } }];
  const a = context(doc(rows, [{ positionId: 'kredit', linkedAssetId: 'garage', interestPercent: 0, monthlyPayment: 300 }]));
  // Gesamt: Kauf neutral, Tilgung 300 € aus dem Konto ist ebenfalls eine Umschichtung → 0
  assert.equal(flows(a, '2025-12', '2026-02').flow, 0);
  // Gruppe Immobilien: Garage + 60.000 € und Kredit + 60.000 € heben sich auf; die Tilgung erhöht das Vermögen der Gruppe um 300 €
  const g = flows(a, '2025-12', '2026-02', 'Immobilien');
  assert.equal(g.flow, 300, 'nur die Tilgung ist Vermögensaufbau der Gruppe'); assert.equal(g.other, 0);
  // Die Gruppe des Kredits selbst enthält keine Positionen mehr
  assert.equal(flows(a, '2025-12', '2026-02', 'Kredit Garagen').flow, 0);
});
test('P8: derselbe Kredit gleicht nur einen Kauf aus, nicht zusätzlich die Neubewertung einer anderen Immobilie', () => {
  // Januar: Wohnung wird von 300.000 auf 310.000 € neu bewertet, gleichzeitig Garage für 60.000 € auf Kredit gekauft
  const rows = [
    { id: 'wohnung', cat: 'realEstate', group: 'Immobilien', values: { '2025-12': 300000, '2026-01': 310000 } },
    { id: 'garage', cat: 'realEstate', group: 'Immobilien', units: true, values: { '2025-12': 0, '2026-01': 60000 } },
    { id: 'kredit', cat: 'liab', group: 'Kredit Garagen', values: { '2025-12': 0, '2026-01': 60000 } }];
  const a = context(doc(rows, [{ positionId: 'kredit', linkedAssetId: 'garage', interestPercent: 0, monthlyPayment: 300 }]));
  const r = flows(a, '2025-12', '2026-01'), g = flows(a, '2025-12', '2026-01', 'Immobilien');
  assert.equal(r.flow, 0, 'Kauf auf Kredit ist neutral'); assert.equal(r.other, 10000, 'Neubewertung bleibt Wertänderung');
  assert.equal(g.flow, 0); assert.equal(g.other, 10000);
});
