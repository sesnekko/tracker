/* P1: Zwei Fenster derselben Herkunft teilen einen Speicher. Jedes Fenster hält das ganze Dokument im Speicher.
   Eine Änderung in Fenster B darf die zuvor gespeicherte Änderung aus Fenster A nicht überschreiben. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../data-store.js');
const { MemoryStorage } = require('./app-harness.cjs');

const seed = () => {
  const s = new MemoryStorage({ 'lt-inflation': '2', 'lt-safety': '85', 'lt-birth-year': '1985' });
  Data.createStore(s);
  return s;
};

test('P1: Fenster B überschreibt die Änderung von Fenster A nicht', () => {
  const storage = seed(), A = Data.createStore(storage), B = Data.createStore(storage);
  A.setItem('lt-inflation', '3');
  assert.throws(() => B.setItem('lt-safety', '90'), e => e.code === 'CONFLICT');
  const saved = JSON.parse(storage.getItem(Data.KEY));
  assert.equal(saved.forecast.settings.inflationPercent, 3, 'Änderung aus A bleibt gespeichert');
  assert.equal(saved.forecast.settings.safetyPercent, 85, 'abgelehnte Änderung aus B wurde nicht geschrieben');
  // B hat den Stand von A übernommen und kann danach normal speichern
  assert.equal(B.getItem('lt-inflation'), '3');
  B.setItem('lt-safety', '90');
  const after = JSON.parse(storage.getItem(Data.KEY)).forecast.settings;
  assert.equal(after.inflationPercent, 3); assert.equal(after.safetyPercent, 90);
});
test('P1: eine Transaktion (z. B. Monatsstand) wird bei einem Konflikt komplett abgelehnt', () => {
  const storage = seed(), A = Data.createStore(storage), B = Data.createStore(storage);
  B.beginTransaction(); B.setItem('lt-safety', '95'); B.setItem('lt-inflation', '1');
  A.setItem('lt-inflation', '4');
  assert.throws(() => B.commitTransaction(), e => e.code === 'CONFLICT');
  assert.equal(JSON.parse(storage.getItem(Data.KEY)).forecast.settings.inflationPercent, 4);
  // nach dem Konflikt ist keine Transaktion mehr offen
  B.beginTransaction(); B.rollbackTransaction();
});
test('P1: reload übernimmt einen fremden Stand, ohne zu schreiben', () => {
  const storage = seed(), A = Data.createStore(storage), B = Data.createStore(storage);
  assert.equal(B.reload(), false, 'ohne fremde Änderung nichts zu tun');
  A.setItem('lt-inflation', '3');
  const raw = storage.getItem(Data.KEY);
  assert.equal(B.reload(), true);
  assert.equal(B.getItem('lt-inflation'), '3');
  assert.equal(storage.getItem(Data.KEY), raw, 'reload schreibt nicht');
  B.setItem('lt-safety', '90');
  assert.equal(JSON.parse(storage.getItem(Data.KEY)).forecast.settings.inflationPercent, 3);
});
test('P1: ein unlesbarer fremder Stand (z. B. neuere App-Version) wird nie überschrieben', () => {
  const storage = seed(), A = Data.createStore(storage);
  const newer = JSON.parse(storage.getItem(Data.KEY)); newer.schemaVersion = 99;
  storage.setItem(Data.KEY, JSON.stringify(newer));
  const raw = storage.getItem(Data.KEY), before = A.document();
  assert.throws(() => A.setItem('lt-inflation', '5'));
  assert.equal(storage.getItem(Data.KEY), raw);
  assert.deepEqual(A.document(), before);
  assert.throws(() => A.reload());
  assert.equal(storage.getItem(Data.KEY), raw);
});
test('P1: Kontrolle – ein einzelnes Fenster speichert wie bisher, auch nach Import und Zurücksetzen', () => {
  const storage = seed(), A = Data.createStore(storage);
  for (let i = 0; i < 5; i++) A.setItem('lt-inflation', String(i));
  A.importBackup(A.exportBackup());
  A.clear(); A.setItem('lt-inflation', '2');
  assert.equal(JSON.parse(storage.getItem(Data.KEY)).forecast.settings.inflationPercent, 2);
});
test('P1: ein Schreibvorgang ohne inhaltliche Änderung löst keinen Konflikt aus und schreibt nicht', () => {
  const storage = seed(), A = Data.createStore(storage), B = Data.createStore(storage);
  A.setItem('lt-inflation', '3');
  const raw = storage.getItem(Data.KEY);
  B.removeItem('customFields');/* Altschlüssel, der nicht existiert: keine Änderung */
  assert.equal(storage.getItem(Data.KEY), raw);
  assert.equal(B.reload(), true, 'der fremde Stand wird danach normal übernommen');
});
