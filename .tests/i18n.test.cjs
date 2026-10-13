const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dict = fs.readFileSync(path.join(root, 'i18n-en.js'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
const english = () => { const a = app(html); vm.runInContext(dict, a.context); return a; };

test('the language is stored in the document, survives a backup and only accepts de or en', () => {
  const store = Data.createStore(new MemoryStorage());
  assert.equal(store.getItem('appLang'), null);
  store.setItem('appLang', 'en');
  assert.equal(store.document().preferences.language, 'en');
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.equal(target.getItem('appLang'), 'en');
  const bad = Data.empty(); bad.preferences.language = 'fr';
  assert.throws(() => Data.validate(bad), /de oder en/);
});

test('German stays the default; L() picks the English text only in English mode', () => {
  const a = app(html);
  assert.equal(a.run('_readLang()'), 'de');
  assert.equal(a.run("L('Ja','Yes')"), 'Ja');
  a.run("appStorage.setItem('appLang','en');_lang=_readLang()");
  assert.equal(a.run("L('Ja','Yes')"), 'Yes');
  assert.equal(a.run('fmtAge(66+4/12)'), '66 y 4 m');
});

test('displayed texts are translated exactly, with numbers and months as placeholders, and by rules', () => {
  const a = english();
  const tr = t => a.run(`_tr(${JSON.stringify(t)})`);
  assert.equal(tr('Speichern'), 'Save');
  assert.equal(tr('  Speichern \n'), '  Save \n', 'surrounding whitespace is kept');
  assert.equal(tr('Ø 1.234 € / Monat'), 'Avg 1.234 € / month');
  assert.equal(tr('Automatische Kreditraten · Nov 2026'), 'Automatic loan payments · Nov 2026');
  assert.equal(tr('Konto „Giro“ löschen?'), 'Delete account "Giro"?');
  assert.equal(tr('Tagesgeld: Bitte eine Zahl zwischen 0 und 1.000 eingeben.'), 'Savings account: please enter a number between 0 and 1.000.');
  assert.equal(tr('Mein eigener Posten'), null, 'user data without a match stays as it is');
  assert.equal(tr('1.234 €'), null);
});

test('the dictionary is consistent: placeholders match, keys use runtime month names, INFO is complete', () => {
  const ctx = { window: {} };
  vm.runInNewContext(dict, ctx);
  const D = ctx.window.I18N_EN;
  const ph = s => [...s.matchAll(/\{(\d)\}/g)].map(m => m[1]).sort().join();
  for (const [k, v] of Object.entries(D.exact)) {
    assert.equal(ph(v), ph(k), 'placeholders of ' + k);
    assert.equal(k, k.replace(/\s+/g, ' ').trim(), 'key is trimmed: ' + k);
    // A template only matches when every number and month of the text became a placeholder.
    if (/\{\d\}/.test(k)) assert.doesNotMatch(k.replace(/\{\d\}/g, ''), /\d|\b(Mär|Mai|Okt|Dez|Januar|Februar|März|Juni|Juli|Oktober|Dezember)\b/, 'numbers and months are placeholders: ' + k);
  }
  assert.equal(D.months.length, 12);
  assert.equal(D.monthsFull.length, 12);
  assert.equal(D.phases.length, 4);
  const a = app(html);
  const infoKeys = a.json('Object.keys(INFO)');
  assert.deepEqual(Object.keys(D.info).sort(), infoKeys.sort());
  for (const [k, v] of Object.entries(D.info)) assert.ok(Array.isArray(v) && v.length === 2 && v[1].startsWith('<p>'), k);
});

test('pension explanations exist in both languages', () => {
  const de = app(html); de.csv(demoCSV);
  de.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{points:20,salary:30000})));");
  assert.match(de.run('_explainDrv(buildPlan().drv)'), /Rentenpunkte/);
  const en = english(); en.csv(demoCSV);
  en.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{points:20,salary:30000})));appStorage.setItem('appLang','en');_lang=_readLang();");
  const text = en.run('_explainDrv(buildPlan().drv)');
  assert.match(text, /Pension points/);
  assert.doesNotMatch(text, /Rentenpunkte|Brutto|netto/);
});

test('budget items are listed by size, largest first', () => {
  const a = app(html); a.csv(demoCSV);
  const list = a.run('_budgetListHTML()');
  const block = list.split('ds-list-t ds-list-sum')[1];
  const ids = [...block.split('ds-list-t')[0].matchAll(/data-ds-open="budget" data-id="([^"]+)"/g)].map(m => m[1].split(':'));
  const bd = a.json('loadBudgetData()');
  const sums = ids.map(([key, id]) => bd[key].find(r => r.id === id).values.reduce((x, y) => x + (+y || 0), 0));
  assert.ok(sums.length > 1);
  assert.deepEqual(sums, [...sums].sort((x, y) => y - x));
});
