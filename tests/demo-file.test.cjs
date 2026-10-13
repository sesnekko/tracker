const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

// Opened via file:// (Chrome app from a folder), fetch() is blocked and the demo comes from demo_backup.js.
test('demo_backup.js carries exactly the demo from demo_backup.json', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'demo_backup.js'), 'utf8'), ctx);
  const fromScript = JSON.parse(JSON.stringify(ctx.window.ASSETS_DEMO_BACKUP));
  assert.deepEqual(fromScript, JSON.parse(fs.readFileSync(path.join(root, 'demo_backup.json'), 'utf8')));
});
