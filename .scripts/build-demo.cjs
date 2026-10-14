// Demo-Haushalt: demo_backup.json ist die Quelle (in der App bearbeitet und exportiert). Das Skript normalisiert
// die Datei und erzeugt daraus demo_backup.js für die lokal geöffnete App (file://). Es ändert keine Inhalte.
// Die frühere Fassung baute die Demo aus .tests/demo_export.csv und hätte Änderungen an der JSON überschrieben
// (PROBLEME.md, DEMO-2); sie steht in der Git-Historie (Commit 7504901).
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'demo_backup.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
Data.validate(doc);
// Ein App-Export enthält den Live-Monat („Heute“, Folgemonat des Exportdatums). Die Demo behält nur den echten
// Verlauf; den Live-Monat legt die App beim Öffnen selbst an (DEMO-4).
if (doc.exportedAt) {
  const d = new Date(doc.exportedAt), month = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  doc.snapshots = doc.snapshots.filter(s => s.month <= month);
  delete doc.exportedAt;
}
// Ältere Schemas wie die App migrieren (z. B. 13 → 14: Nettogehalt → Budgetposten, Depot-Kinder → Kinder als Personen)
Data.migrate(doc);
doc.schemaVersion = Data.VERSION;
Data.validate(doc);
function demoScript(d) {
  return '/* Demo-Daten für die lokal geöffnete App (file://), erzeugt von .scripts/build-demo.cjs aus demo_backup.json. */\n'
    + 'window.ASSETS_DEMO_BACKUP=' + JSON.stringify(d) + ';\n';
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
// Dieselbe Demo als Skript: Lokal geöffnet (file://) blockt Chrome fetch(), ein <script> darf aber geladen werden.
fs.writeFileSync(path.join(root, 'demo_backup.js'), demoScript(doc));
console.log('demo_backup.json + demo_backup.js:', doc.snapshots.length, 'months,', doc.positions.length, 'positions, schema', doc.schemaVersion);
