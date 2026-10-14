// Wendet die Funktion „Werte aus Kursen übernehmen“ (quoteHistoryFlow) auf alle Kurspositionen der Demo an.
// Kurse: .scripts/demo-prices.json (Yahoo-Monatsschlusskurse in EUR, einmal über die App abgerufen), damit das Ergebnis
// ohne Netz wiederholbar ist. Stand M = Stückzahl im Stand M × Schlusskurs des Vormonats; Monate ohne Kurs bleiben.
// Danach: node .scripts/build-demo.cjs (erzeugt demo_backup.js).
const fs = require('node:fs');
const path = require('node:path');
const { app, MemoryStorage } = require('../.tests/app-harness.cjs');
const Data = require('../data-store.js');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'demo_backup.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const prices = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-prices.json'), 'utf8'));
const a = app(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), new MemoryStorage({ [Data.KEY]: JSON.stringify(doc) }));
a.context.prices = prices;
a.run(`_fc=loadFieldConfig();_toast=()=>{};_ask=async()=>true;
  const bySymbol={};_fc.fields.forEach(f=>{const i=AssetModel.valuation(f)==='market'?AssetModel.instrument(f):null;if(i&&prices[f.id])bySymbol[_historySymbol(i)]=prices[f.id];});
  fetchMonthlyPricesEUR=async s=>{if(!bySymbol[s])throw new Error('Kein Kurs für '+s);return bySymbol[s];};`);
const net = m => a.json(`Math.round(calc(loadData()['${m}']).net)`);
const before = { '2024-01': net('2024-01'), '2025-01': net('2025-01'), '2026-10': net('2026-10') };
(async () => {
  const ids = a.json("_fc.fields.filter(f=>AssetModel.valuation(f)==='market').map(f=>f.id)");
  for (const id of ids) {
    const r = a.json(`(()=>{const f=_fc.fields.find(x=>x.id===${JSON.stringify(id)});const i=AssetModel.instrument(f);return quoteHistoryChanges(f.id,prices[f.id]||{});})()`);
    const ok = await a.run(`quoteHistoryFlow(${JSON.stringify(id)})`);
    console.log(id.padEnd(20), ok ? r.changes.length + ' Monate neu' : 'unverändert', r.skipped ? '(' + r.skipped + ' ohne Kurs)' : '');
  }
  const after = { '2024-01': net('2024-01'), '2025-01': net('2025-01'), '2026-10': net('2026-10') };
  console.log('Nettovermögen vorher', before, 'nachher', after);
  const out = a.json('appStorage.document()');
  Data.validate(out);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
})().catch(error => { console.error(error); process.exit(1); });
