const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Data = require('../data-store.js');
const AssetModel = require('../asset-model.js');
const LoanHistory = require('../loan-history.js');
const LoanModel = require('../loan-model.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demo = JSON.parse(fs.readFileSync(path.join(root, 'demo_backup.json'), 'utf8'));

/* Wie im Browser: window ist das globale Objekt, localStorage und sessionStorage sind Eigenschaften davon. */
function browser(local, session) {
  const el = id => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, dataset: {}, value: '', querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, focus() {} });
  const context = vm.createContext({
    AssetsData: Data, LoanModel, LoanHistory, AssetModel, Date: FixedDate, console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, confirm: () => true, alert() {}, navigator: {},
    location: { reload() {} }, matchMedia: () => ({ matches: false }), addEventListener() {},
    document: { body: { children: [], classList: { add() {}, remove() {}, toggle() {} } }, activeElement: null, referrer: '', readyState: 'loading', addEventListener() {}, getElementById: el, querySelector: () => null, querySelectorAll: () => [] }
  });
  vm.runInContext('this.window=this', context);
  context.localStorage = local;
  context.sessionStorage = session;
  vm.runInContext(html.split('<script>').at(-1).split('</script>')[0], context);
  vm.runInContext("render=()=>{};navigateToPage=()=>{};_ask=async()=>true;", context);
  return { context, run: code => vm.runInContext(code, context) };
}
function ownStorage() {
  const store = Data.createStore(new MemoryStorage());
  const doc = Data.empty();
  doc.retirement.primary.birthYear = 1990;
  store.importBackup({ ...doc, format: Data.FORMAT, exportedAt: '2026-10-08T10:00:00.000Z' });
  const local = new MemoryStorage();
  local.setItem(Data.KEY, JSON.stringify(store.document()));
  local.setItem('vermoegen-backup-date', '2026-10-01T10:00:00.000Z');
  return local;
}

test('the demo runs on sample data in memory and never writes the own storage', () => {
  const local = ownStorage(), before = JSON.stringify(local.values);
  const session = new MemoryStorage({ 'wertnest-demo': '1', 'wertnest-demo-doc': JSON.stringify(demo), 'wertnest-demo-tour': '1', 'wertnest-demo-first': '0' });
  const a = browser(local, session);
  assert.equal(a.run('!!_demo'), true);
  assert.equal(a.run('_demo.tour'), true);
  assert.equal(session.getItem('wertnest-demo-tour'), '0', 'a reload does not restart the tour');
  assert.equal(a.run('appStorage.document().positions.length'), demo.positions.length, 'sample data shown');
  assert.equal(a.run('localStorage===_introStore'), false, 'localStorage is replaced in the demo');
  // Schreiben in der Demo: Dokument, Geräteschlüssel, Sprache
  a.run("appStorage.renamePosition(appStorage.document().positions[0].id,'Geändert');localStorage.setItem('vermoegen-backup-date','x');appStorage.setItem('appLang','en')");
  assert.equal(a.run('appStorage.document().positions[0].name'), 'Geändert', 'changes stay in memory');
  assert.equal(JSON.stringify(local.values), before, 'the own storage is untouched');
  // Fortschritt der Einführung liegt im echten Speicher
  a.run('_introSave(3)');
  assert.equal(local.getItem('wertnest-intro-step'), '3');
});

test('without the session flag the app uses the own storage as before', () => {
  const local = ownStorage();
  const a = browser(local, new MemoryStorage());
  assert.equal(a.run('_demo'), null);
  assert.equal(a.run('appStorage.document().retirement.primary.birthYear'), 1990);
  assert.equal(a.run('localStorage===_introStore'), true);
});

test('broken sample data falls back to the normal start and clears the demo session', () => {
  const local = ownStorage();
  const session = new MemoryStorage({ 'wertnest-demo': '1', 'wertnest-demo-doc': '{"format":"x"}' });
  const a = browser(local, session);
  assert.equal(a.run('_demo'), null);
  assert.equal(session.getItem('wertnest-demo'), null);
  assert.equal(a.run('appStorage.document().retirement.primary.birthYear'), 1990);
});

test('intro progress: resume between the first and the last step, close on the last step finishes', () => {
  const a = app(html);
  const steps = a.run('_introSteps().length');
  assert.equal(steps, 11);
  assert.equal(a.run('_introSaved()'), null);
  a.run('_introSave(4)');
  assert.equal(a.run('_introSaved()'), 4);
  assert.match(a.run('_introSub()'), /Weiter bei 5 von 11/);
  a.run('_introSave(10)');
  assert.equal(a.run('_introSaved()'), null, 'the closing step is no resume point');
  a.run('_introSave(0)');
  assert.equal(a.run('_introSaved()'), null);
  a.run('_introDone()');
  assert.equal(a.storage.getItem('wertnest-intro-completed'), '1');
});

test('the welcome offers setup, the introduction and loading data, without replacing data by the demo', () => {
  const a = app(html);
  const welcome = a.run('guideWelcome()');
  assert.match(welcome, /Geführt einrichten/);
  assert.match(welcome, /App kennenlernen/);
  assert.match(welcome, /Bestehende Daten laden/);
  assert.doesNotMatch(welcome, /_v2LoadDemo/);
});
