/* Historische Werte einer Kursposition aus Kursen neu berechnen (Entscheidung 14.10.2026, DEMO-5).
   Ein Monatsstand M ist der Stand beim Wechsel in den Monat M – so friert auch der Live-Monat ein. Bewertet wird
   deshalb mit dem Schlusskurs des Vormonats in Euro (umgerechnet mit dem Wechselkurs desselben Monatsendes) ×
   der in diesem Monatsstand erfassten Stückzahl. Vorher fragt die App nach; ohne Bestätigung ändert sich nichts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { context, Data } = require('./forecast-fixture.cjs');

function doc() {
  const d = Data.empty();
  d.groups = [{ id: 'g0', name: 'ETF', assumptions: {} }, { id: 'g1', name: 'Cash', assumptions: {} }];
  d.positions = [
    { id: 'etf', name: 'ETF', category: 'etf', groupId: 'g0', archived: false, custom: true, ticker: 'X.DE', unit: { name: 'Stück', key: 'etf' },
      liquidity: 'liquid', valuation: 'market', instrument: { provider: 'yahoo', symbol: 'X.DE', exchange: 'XETRA', currency: 'USD', name: 'X' },
      lastQuote: { priceEUR: 125, price: 125, currency: 'EUR', asOf: '2026-10-08T10:00:00.000Z', fetchedAt: '2026-10-08T10:00:00.000Z' } },
    { id: 'konto', name: 'Konto', category: 'cash', groupId: 'g1', archived: false, custom: true, ticker: null, unit: null, liquidity: 'liquid', valuation: 'manual' }];
  const snap = (month, q, v, cash) => ({ month, positions: [
    { positionId: 'etf', value: v, ...(q === null ? {} : { quantity: q }) }, { positionId: 'konto', value: cash }] });
  d.snapshots = [
    snap('2026-05', 8, 700, 1000),   // kein Kurs für April → bleibt
    snap('2026-06', null, 500, 1000), // keine Stückzahl → bleibt
    snap('2026-07', 10, 1000, 1000),
    snap('2026-08', 12, 1250, 1100),
    snap('2026-09', 12, 1300, 1200),
    snap('2026-10', 12, 1400, 1300),
    snap('2026-11', 12, 1500, 1400)]; // Live-Monat (Harness-Datum 08.10.2026) → bleibt
  d.retirement.primary.birthYear = 1985;
  return d;
}
/* Monatsschlusskurse in USD und Wechselkurs USD→EUR zum selben Monatsende */
const usd = { '2026-05': 100, '2026-06': 105, '2026-07': 110, '2026-08': 100, '2026-09': 120, '2026-10': 130 };
const fx = { '2026-05': 0.9, '2026-06': 0.92, '2026-07': 0.9, '2026-08': 0.95, '2026-09': 0.85, '2026-10': 0.86 };
function app(answer = true) {
  const a = context(doc());
  a.context.mock = { usd, fx, asked: [] };
  a.run(`_yahooMonthlyReal=_yahooMonthly;_yahooMonthly=async s=>s==='USDEUR=X'?{prices:mock.fx,currency:'EUR'}:{prices:mock.usd,currency:'USD'};
    _ask=async o=>{mock.asked.push(o);return ${answer};};_toast=()=>{};`);
  return a;
}
const values = a => a.json("(()=>{const d=loadStoredData();return Object.fromEntries(Object.keys(d).sort().map(m=>[m,[d[m]._details.etf,d[m]._details.konto]]));})()");

test('Kurs zum Monatswechsel: Stand M = Schlusskurs des Vormonats in Euro × Stückzahl im Stand M', async () => {
  const a = app(true);
  assert.equal(await a.run("quoteHistoryFlow('etf')"), true);
  const v = values(a);
  // Juni: 105 USD × 0,92 = 96,60 € → Stand Juli 10 × 96,60; Juli 110 × 0,90 = 99 € → Stand August 12 × 99 usw.
  assert.deepEqual(v['2026-07'], [966, 1000]);
  assert.deepEqual(v['2026-08'], [1188, 1100]);
  assert.deepEqual(v['2026-09'], [12 * 95, 1200], '100 USD × 0,95');
  assert.deepEqual(v['2026-10'], [12 * 102, 1300], '120 USD × 0,85');
  assert.deepEqual(v['2026-11'], [1500, 1400], 'Live-Monat bleibt beim Live-Kurs');
  assert.deepEqual(v['2026-06'], [500, 1000], 'ohne Stückzahl unverändert');
  assert.deepEqual(v['2026-05'], [700, 1000], 'ohne Kurs zum Monatswechsel unverändert');
  const net = a.json("calc(loadData()['2026-10']).net");
  assert.equal(net, 1224 + 1300, 'Summen werden neu gebildet');
});
test('ohne Bestätigung ändert sich nichts; die Rückfrage nennt Umfang und ein Beispiel', async () => {
  const a = app(false), before = a.storage.getItem(Data.KEY);
  assert.equal(await a.run("quoteHistoryFlow('etf')"), false);
  assert.equal(a.storage.getItem(Data.KEY), before);
  const asked = a.json('mock.asked');
  assert.equal(asked.length, 1);
  assert.match(asked[0].text, /4 Monate/);
  assert.match(asked[0].text, /Juli 2026 bis Oktober 2026/);
  assert.match(asked[0].text, /überschrieben/);
  assert.equal(asked[0].danger, true);
});
test('passt der Verlauf schon, fragt die App nicht und schreibt nichts', async () => {
  const a = app(true);
  await a.run("quoteHistoryFlow('etf')");
  const after = a.storage.getItem(Data.KEY);
  a.run('mock.asked.length=0');
  assert.equal(await a.run("quoteHistoryFlow('etf')"), false);
  assert.equal(a.json('mock.asked.length'), 0);
  assert.equal(a.storage.getItem(Data.KEY), after);
});
test('Kursabruf scheitert: nichts wird geändert', async () => {
  const a = app(true), before = a.storage.getItem(Data.KEY);
  a.run("_yahooMonthly=async()=>{throw new Error('offline');};");
  assert.equal(await a.run("quoteHistoryFlow('etf')"), false);
  assert.equal(a.storage.getItem(Data.KEY), before);
});
test('manuelle Positionen werden nie aus Kursen berechnet', async () => {
  const a = app(true), before = a.storage.getItem(Data.KEY);
  assert.equal(await a.run("quoteHistoryFlow('konto')"), false);
  assert.equal(a.storage.getItem(Data.KEY), before);
});
test('der Verlauf einer Position rechnet mit demselben Kurs zum Monatswechsel', () => {
  const a = app(true);
  assert.equal(a.json("_monthChangePrice({'2026-09':99,'2026-10':120},'2026-10')"), 99);
  assert.equal(a.json("_monthChangePrice({'2026-10':120},'2026-10')"), null);
});
test('Monate ohne Handel (Umsatz 0, Hoch = Tief) sind kein Kurs und werden nicht übernommen', async () => {
  const a = app(true);
  // Monatsbalken wie von Yahoo: Zeitstempel am Monatsanfang in Börsenzeit (UTC+2), drei Platzhalter mit 90,56 ohne Umsatz
  const ts = ['2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01'].map(d => Date.parse(d + 'T00:00:00+02:00') / 1000);
  a.context.raw = JSON.stringify({ chart: { result: [{ meta: { currency: 'EUR', gmtoffset: 7200 }, timestamp: ts, indicators: { quote: [{
    close: [90.56, 90.56, 90.56, 94, 84.35], high: [90.56, 90.56, 90.56, 96, 93.56], low: [90.56, 90.56, 90.56, 90.34, 84.2], volume: [0, 0, 0, 86427, 72046] }] } }] } });
  a.run("fetchWithTimeout=async()=>({ok:true,text:async()=>raw});");
  const p = await a.run("(async()=>JSON.stringify((await _yahooMonthlyReal('NESR.DE')).prices))()");
  assert.deepEqual(JSON.parse(p), { '2025-05': 94, '2025-06': 84.35 });
});
test('Rückfrage wird angeboten, wenn eine Position mit früheren Stückzahlen neu auf Kurse umgestellt wird', () => {
  const a = app(true);
  a.run('globalThis.__timers=[];setTimeout=(fn)=>{__timers.push(fn);return 0;};');
  const offered = before => { a.run('__timers.length=0'); a.run(`_offerQuoteHistory('etf',${JSON.stringify(before)})`); return a.json('__timers.length'); };
  assert.equal(offered(null), 1, 'vorher manuell bewertet');
  assert.equal(offered('yahoo|OTHER.DE'), 1, 'andere Kursquelle');
  assert.equal(offered(a.json("_quoteState(_fc.fields.find(f=>f.id==='etf'))")), 0, 'unveränderte Kursquelle: keine Rückfrage');
  a.run('__timers.length=0'); a.run("_offerQuoteHistory('konto',null)");
  assert.equal(a.json('__timers.length'), 0, 'manuelle Position: keine Rückfrage');
});
