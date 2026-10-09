// Fictional household: keep the legacy sample history, add current model features.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../tests/app-harness.cjs');
const Data = require('../data-store.js');
const Loan = require('../loan-model.js');
const root = path.resolve(__dirname, '..');
const demo = app(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
demo.csv(fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8'));
const doc = JSON.parse(demo.storage.getItem(Data.KEY));
// CSV import creates a synthetic live month. Keep the demo's actual history only;
// the target device creates its live month when the app opens.
doc.snapshots = doc.snapshots.filter(s => s.month <= '2026-10');
doc.schemaVersion = Data.empty().schemaVersion;
doc.preferences.onboardingCompleted = true;

// All example prices are fictional. Manual valuation makes the demo reproducible
// offline and avoids silently replacing example values with actual market prices.
for (const p of doc.positions) {
  p.liquidity = ['bav', 'illiquid', 'liab'].includes(p.category) ? 'illiquid' : 'liquid';
  p.valuation = 'manual';
  if (p.category === 'etf') p.instrument = {provider: 'yahoo', symbol: p.ticker, exchange: 'XETRA', currency: 'EUR', name: p.name};
  if (p.id === 'bitcoin') {
    p.category = 'bitcoin'; p.unit.name = 'BTC'; p.ticker = 'XBTEUR';
    p.instrument = {provider: 'bitcoin', symbol: 'XBTEUR', exchange: 'Kraken', currency: 'EUR', name: 'Bitcoin / EUR'};
  }
  if (p.id === 'gold') { p.category = 'metal'; p.name = 'Gold (physisch)'; p.ticker = null; }
  if (p.id === 'bausparvertrag') p.name = 'Betriebliche Altersvorsorge';
  if (p.id === 'wohnung-marktwert') p.category = 'realEstate';
}
doc.groups.find(g => g.id === 'group-5').name = 'Altersvorsorge';
doc.groups.find(g => g.id === 'group-5').assumptions.availableFromAge = 67;
doc.groups.push(
  {id: 'group-stock', name: 'Aktien', defaultProfile: 'stocks', assumptions: {returnPercent: 5, volatilityPercent: 20, monthlySaving: 250}},
  {id: 'group-crypto', name: 'Krypto', defaultProfile: 'crypto', assumptions: {returnPercent: 6, volatilityPercent: 55, monthlySaving: 25}},
  {id: 'group-car', name: 'Auto', defaultProfile: 'misc', assumptions: {returnPercent: -10, volatilityPercent: 0, monthlySaving: 0}}
);
const position = (id, name, category, groupId, liquidity, unit = null) => ({id, name, category, groupId, archived: false, custom: true, ticker: null, unit, liquidity, valuation: 'manual'});
const stock = (id, name, symbol) => ({...position(id, name, 'stock', 'group-stock', 'liquid', {name: 'Stück', key: id}), instrument: {provider: 'yahoo', symbol, exchange: 'XETRA', currency: 'EUR', name}});
doc.positions.push(
  stock('aktie-apple', 'Apple', 'APC.DE'),
  stock('aktie-amazon', 'Amazon', 'AMZ.DE'),
  stock('aktie-nestle', 'Nestlé', 'NESR.DE'),
  {...position('ethereum', 'Ethereum', 'crypto', 'group-crypto', 'liquid', {name: 'ETH', key: 'ethereum'}), ticker: 'ETHEUR', instrument: {provider: 'kraken', symbol: 'ETHEUR', exchange: 'Kraken', currency: 'EUR', name: 'Ethereum / EUR'}},
  position('familienauto', 'Familienauto', 'vehicle', 'group-car', 'illiquid'),
  position('kredit-auto', 'Autokredit', 'liab', 'group-car', 'illiquid')
);
doc.positions.find(p => p.id === 'kredit-wohnung').name = 'Immobilienkredit';
doc.loans = [
  {positionId: 'kredit-wohnung', linkedAssetId: 'wohnung-marktwert', principalAmount: 240000, interestPercent: 3.5, initialRepaymentPercent: 2.5, monthlyPayment: 1200, firstPaymentMonth: '2024-01', fixedInterestYears: 10, followUpInterestPercent: 4, extraPayments: [
    {id: 'extra-home-2024', month: '2024-12', amount: 2500},
    {id: 'extra-home-2025', month: '2025-12', amount: 3000},
    {id: 'extra-home-2026', month: '2026-08', amount: 2500}
  ]},
  {positionId: 'kredit-auto', linkedAssetId: 'familienauto', principalAmount: 20000, interestPercent: 6, initialRepaymentPercent: 18, monthlyPayment: 400, firstPaymentMonth: '2025-01', fixedInterestYears: 5, extraPayments: [{id: 'extra-car-2026', month: '2026-03', amount: 1000}]}
];
const params = l => ({principal: l.principalAmount, rate: l.interestPercent, repayment: l.initialRepaymentPercent, pay: l.monthlyPayment, firstDue: l.firstPaymentMonth, fixedYears: l.fixedInterestYears, follow: l.followUpInterestPercent, extras: l.extraPayments});
for (const [i, s] of doc.snapshots.entries()) {
  const carMonths = Math.max(0, i - 12);
  s.positions.push(
    {positionId: 'ethereum', quantity: Loan.cents(0.4 + i * 0.01), value: Loan.cents((0.4 + i * 0.01) * (1800 + i * 20 + Math.sin(i / 2) * 300))},
    {positionId: 'familienauto', value: s.month < '2025-01' ? 0 : Loan.cents(28000 * Math.pow(0.99, carMonths))},
    {positionId: 'kredit-auto', value: Loan.at(params(doc.loans[1]), s.month).balance}
  );
  s.positions.find(p => p.positionId === 'kredit-wohnung').value = Loan.at(params(doc.loans[0]), s.month).balance;
}
// Market paths: fictional, but with realistic monthly swings. A seeded generator keeps
// every build identical; shared shocks (a correction in spring 2025, a crypto setback
// in late 2025) move the whole portfolio together like a real market would.
const months = doc.snapshots.map(s => s.month), n = months.length;
let seed = 20260101;
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
const shocks = {'2024-04': -0.04, '2024-08': -0.07, '2024-11': 0.05, '2025-03': -0.08, '2025-04': -0.07, '2025-05': 0.06, '2025-11': -0.05, '2026-03': 0.04};
const cryptoShocks = {'2024-03': 0.25, '2024-06': -0.12, '2024-11': 0.3, '2025-02': -0.15, '2025-04': -0.1, '2025-11': -0.22, '2025-12': -0.08, '2026-05': 0.15};
function pricePath(start, end, vol, beta = 1, crypto = false) {
  const raw = [1];
  for (let i = 1; i < n; i++) raw.push(raw[i - 1] * Math.exp(vol * gauss() + beta * (shocks[months[i]] || 0) + (crypto ? cryptoShocks[months[i]] || 0 : 0)));
  // Scale the trend so the path starts and ends exactly at the given prices.
  const k = Math.log(end / start / raw[n - 1]) / (n - 1);
  return raw.map((r, i) => start * r * Math.exp(k * i));
}
const holdings = (from, to, digits) => months.map((_, i) => +(from + (to - from) * i / (n - 1)).toFixed(digits));
const market = {
  'msci-world-a0rpwh': {price: pricePath(84, 131, 0.025), qty: holdings(560, 880, 2)},
  's-p-500-a0yedg': {price: pricePath(470, 610, 0.03, 1.1), qty: holdings(55, 92, 2)},
  'bitcoin': {price: pricePath(39000, 74000, 0.12, 1.4, true), qty: holdings(0.3, 0.55, 4)},
  'ethereum': {price: pricePath(2100, 3300, 0.14, 1.4, true), qty: holdings(1.5, 2.4, 3)},
  'aktie-apple': {price: pricePath(170, 228, 0.06, 1.2), qty: holdings(40, 65, 0)},
  'aktie-amazon': {price: pricePath(140, 205, 0.07, 1.3), qty: holdings(45, 70, 0)},
  'aktie-nestle': {price: pricePath(101, 84, 0.04, 0.5), qty: holdings(80, 110, 0)},
  'gold': {price: pricePath(1900, 3700, 0.03, -0.3), qty: holdings(5, 5, 0)}
};
// More cash, with the car purchase and later top-ups visible in the curve.
const tagesgeld = months.map((m, i) => Loan.cents(22000 + i * 450 + Math.sin(i / 2.5) * 1800 - (m >= '2025-01' ? 9000 : 0) + (m >= '2026-01' ? 4000 : 0)));
for (const [i, s] of doc.snapshots.entries()) {
  for (const [id, m] of Object.entries(market)) {
    const entry = {positionId: id, quantity: m.qty[i], value: Loan.cents(m.qty[i] * m.price[i])};
    const at = s.positions.findIndex(p => p.positionId === id);
    if (at >= 0) s.positions[at] = entry; else s.positions.push(entry);
  }
  s.positions.find(p => p.positionId === 'tagesgeld').value = tagesgeld[i];
}
// Contract payments already feed the budget automatically; remove the old
// generic principal row so its payment isn't counted a second time.
doc.budget.items = doc.budget.items.filter(b => b.kind !== 'principal' && b.kind !== 'loanPayment');
doc.budget.items.push(
  {id: 'budget-stock', name: 'Aktien-Sparplan', category: 'sparen', subcategory: '', kind: 'saving', targetGroupId: 'group-stock', monthlyAmounts: Array(12).fill(250)},
  {id: 'budget-crypto', name: 'Krypto-Sparplan', category: 'sparen', subcategory: '', kind: 'saving', targetGroupId: 'group-crypto', monthlyAmounts: Array(12).fill(25)},
  {id: 'budget-pension', name: 'Altersvorsorge-Beiträge', category: 'sparen', subcategory: '', kind: 'saving', targetGroupId: 'group-5', monthlyAmounts: Array(12).fill(70)}
);
// Account references use IDs, so renaming leaves the standing orders intact.
doc.accounts.forEach(a => { a.name += ' (Demo)'; a.iban = ''; });
doc.retirement.primary.name = 'Max (Demo)';
doc.retirement.primary.statutoryPension.retirementAge = 67;
doc.retirement.people[0].name = 'Anna (Demo)';
doc.retirement.people[0].workUntilAge = 67;
doc.forecast.settings.retirementAge = 67;
doc.forecast.settings.saveUntilAge = 67;
doc.forecast.events[1] = {id: 'event-2', name: 'Renovierung', year: 2030, amount: 15000, from: {type: 'liquid'}, to: {type: 'external'}};
Data.validate(doc);
fs.writeFileSync(path.join(root, 'demo_backup.json'), JSON.stringify(doc, null, 2) + '\n');
console.log('demo_backup.json:', doc.snapshots.length, 'months,', doc.positions.length, 'positions');
