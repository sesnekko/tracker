/* 15.10.2026: Eigener Name (Daten → Haushalt → Ich). Gespeichert in retirement.primary.name (kein Schemawechsel), über den
   Schlüssel 'lt-own-name'. Ohne Eintrag bleibt der Standardname „Eigene Person“ im Dokument und die App zeigt „Ich“. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');

test('Speicher: Name wird ins Dokument geschrieben, exportiert und importiert; leer = Standardname', () => {
  const s = Data.createStore(new MemoryStorage());
  assert.equal(s.getItem('lt-own-name'), null, 'Standardname erscheint nicht als Eintrag');
  s.setItem('lt-own-name', '  Lukas ');
  assert.equal(s.document().retirement.primary.name, 'Lukas');
  assert.equal(s.getItem('lt-own-name'), 'Lukas');
  s.setItem('lt-birth-year', '1992');
  assert.equal(s.document().retirement.primary.name, 'Lukas', 'andere Änderungen lassen den Namen stehen');
  const b = Data.createStore(new MemoryStorage()); b.importBackup(JSON.parse(JSON.stringify(s.exportBackup())));
  assert.equal(b.getItem('lt-own-name'), 'Lukas');
  s.setItem('lt-own-name', '   ');
  assert.equal(s.document().retirement.primary.name, 'Eigene Person');
  assert.equal(s.getItem('lt-own-name'), null);
  s.setItem('lt-own-name', 'x'.repeat(60));
  assert.equal(s.getItem('lt-own-name').length, 40, 'höchstens 40 Zeichen');
});

// Seit 15.10.2026 im Personen-Sheet (Haushalt → Ich) statt im Bearbeiten-Modus der Ich-Karte
test('App: Feld im Personen-Sheet, Speichern, Name statt „Ich“ neben anderen Personen', () => {
  const a = app(html); a.csv(demoCSV);
  assert.equal(a.run('_meName()'), 'Ich');
  a.run("openPersonSheet('me')");
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /id="hp-name"[^>]*placeholder="Ich" maxlength="40"/);
  a.el('hp-name').value = 'Lukas';
  a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'), false, 'gespeichert und geschlossen');
  assert.equal(a.json('appStorage.document().retirement.primary.name'), 'Lukas');
  assert.match(a.run('_householdListHTML()'), /data-ds-open="person" data-id="me"><span class="ds-item-l"><span>Lukas<\/span>/);
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'p1',name:'Miri',by:1990,until:60,points:10}]))");
  assert.equal(a.json("_personOptions('Mich')[0][1]"), 'Lukas', 'Auswahl „Für“');
  assert.match(a.run("_v2SubText('household')"), /^Lukas · Miri/);
  assert.match(a.run('_phaseWorkTxt(getLifetimeSettings(),getDrvExtra(),1)'), /Lukas/);
  // Name mit Sonderzeichen wird escaped
  a.run("appStorage.setItem('lt-own-name','<i>Lu</i>')");
  assert.match(a.run('_householdListHTML()'), /&lt;i&gt;Lu&lt;\/i&gt;/);
  assert.doesNotMatch(a.run('_householdListHTML()'), /<i>Lu/);
  // leeren: wieder „Ich“
  a.run("openPersonSheet('me')"); a.el('hp-name').value = '';
  a.run('_submitSheet()');
  assert.equal(a.run('_meName()'), 'Ich');
  assert.equal(a.json('appStorage.document().retirement.primary.name'), 'Eigene Person');
});
