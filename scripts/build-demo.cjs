// Regenerate the bundled JSON demo through the supported CSV import path.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../tests/app-harness.cjs');
const Data = require('../data-store.js');
const root = path.resolve(__dirname, '..');
const demo = app(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
demo.csv(fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8'));
const doc = JSON.parse(demo.storage.getItem(Data.KEY));
// CSV import creates a synthetic live month. Keep the demo's actual history only;
// the target device creates its live month when the app opens.
doc.snapshots = doc.snapshots.filter(s => s.month <= '2026-10');
Data.validate(doc);
fs.writeFileSync(path.join(root, 'demo_backup.json'), JSON.stringify(doc, null, 2) + '\n');
console.log('demo_backup.json:', doc.snapshots.length, 'months,', doc.positions.length, 'positions');
