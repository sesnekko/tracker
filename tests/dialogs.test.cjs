const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(root, 'demo_export.csv'), 'utf8');
const tick = () => new Promise(r => setImmediate(r));

// Native confirm() is never used: embedded browsers suppress it and the action would silently stop.
test('no native confirm() or alert() calls remain', () => {
  const script = html.split('<script>').at(-1).split('</script>')[0].replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(script, /(^|[^.\w])(confirm|alert)\(/);
});

test('reset and delete keep the data when the in-app dialog is cancelled', async () => {
  const a = app(html); a.csv(demoCSV);
  const before = a.storage.getItem(Data.KEY);
  a.run('_ask=async()=>false');
  await a.run('resetApp()');
  await a.run("removeCustomField(_fc.fields.find(f=>f.custom??String(f.id).startsWith('custom-'))?.id||_fc.fields[0].id)");
  assert.equal(a.storage.getItem(Data.KEY), before);
  a.run('_ask=async()=>null');
  await a.run('resetApp()');
  assert.equal(a.storage.getItem(Data.KEY), before);
  a.run('_ask=async()=>true');
  await a.run('resetApp()');
  assert.equal(a.json('appStorage.document().snapshots.length'), 0);
});

test('pending edits: the interrupted action continues after "Verwerfen", not after dismissing', async () => {
  const a = app(html);
  a.run('let ran=0;_editMode=true;_ask=async()=>null;');
  assert.equal(a.run('_resolvePendingEdits(()=>ran++)'), false);
  await tick();
  assert.equal(a.run('ran'), 0, 'dismissed: nothing happens');
  assert.equal(a.run('_editMode'), true);
  a.run('_ask=async()=>false;');
  assert.equal(a.run('_resolvePendingEdits(()=>ran++)'), false);
  await tick();
  assert.equal(a.run('ran'), 1, 'discarded: action runs once');
  assert.equal(a.run('_editMode'), false);
  assert.equal(a.run('_resolvePendingEdits(()=>ran++)'), true, 'nothing pending: no question');
});

test('a dirty sheet asks before closing and only closes on confirmation', async () => {
  const a = app(html);
  a.run('let ran=0;_sheetOpen=true;_sheetDirty=true;_ask=async()=>false;');
  assert.equal(a.run('_closeSheet(false,()=>ran++)'), false);
  await tick();
  assert.equal(a.run('_sheetOpen'), true);
  a.run('_ask=async()=>true;');
  assert.equal(a.run('_closeSheet(false,()=>ran++)'), false);
  await tick();
  assert.equal(a.run('_sheetOpen'), false);
  assert.equal(a.run('ran'), 1);
});
