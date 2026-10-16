/* 15.10.2026: Daten-Seite einheitlich wie Vermögenswerte und Verbindlichkeiten. Haushalt, Altersvorsorge und die
   automatischen Budgetposten sind Listen; ein Eintrag antippen öffnet sein Sheet zum Ansehen und Bearbeiten, je Bereich ein
   „+ … hinzufügen“. Kein Bearbeiten-Modus für einen ganzen Bereich mehr. Die Sheets speichern mit denselben Regeln wie das
   frühere Speichern im Bearbeiten-Modus (leere Zahlen, Phasen der Person, Entfernen mit Neuzuordnung). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
const set = (a, key, value) => a.run(`appStorage.setItem(${JSON.stringify(key)},${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))})`);
const KIM = { id: 'p1', name: 'Kim', by: 1988, until: 60, w2: 50, points: 10, salary: 30000, bv: { pay: 3000, years: 5 } };
function ctx() {
  const a = app(html); a.csv(demoCSV);
  set(a, 'lt-drv-extra', [KIM]);
  set(a, 'lt-children', [{ id: 'c1', name: 'Lena', by: 2019, parent: 'p1' }]);
  const pos = a.run("_fc.fields.find(f=>f.category!=='liab').id");
  set(a, 'lt-av-depots', [{ id: 'd1', name: 'Depot Kim', person: 'p1', contrib: 100 }, { id: 'd2', name: 'Mein Depot', person: '', contrib: 150, pos }]);
  set(a, 'lt-pensions', [{ name: 'Betriebsrente Kim', person: 'p1', amount: 200, from: 65 }]);
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  return a;
}
const fill = (a, values) => { for (const [id, v] of Object.entries(values)) a.el(id).value = v; };
const submit = a => { a.run('_submitSheet()'); return a.run('_sheetOpen'); };

test('Liste statt Karten: Haushalt mit Personen und Kindern, je Bereich ein Hinzufügen-Knopf, kein Bearbeiten', () => {
  const a = ctx();
  const hh = a.run('_householdListHTML()');
  assert.deepEqual([...hh.matchAll(/data-ds-open="(person|child)" data-id="([^"]*)"/g)].map(m => m[1] + ':' + m[2]), ['person:me', 'person:p1', 'child:c1']);
  assert.match(hh, /Kim<\/span><small>Jahrgang 1988 · Rente ab 67/);
  assert.equal((hh.match(/class="ds-add"/g) || []).length, 1);
  const page = a.run("(buildDynamicFormForTest(),document.getElementById('dataPageContent').innerHTML)");
  assert.doesNotMatch(page, /ds-sec-actions|enterEditMode|hh-card|plan-row/, 'Haushalt und Altersvorsorge ohne Karten und Bearbeiten-Knopf');
  assert.match(page, /data-ds-open="add-hh"/); assert.match(page, /data-ds-open="add-pv"/);
  // Auswahl beim Hinzufügen wie bei Vermögenswerten
  a.run("openPvAddSheet('pension')");
  assert.deepEqual([...a.run("document.getElementById('dsBody').innerHTML").matchAll(/data-ds-open="([^"]+)"/g)].map(m => m[1]), ['add-avd', 'add-pen', 'add-bv']);
});

test('Personen-Sheet: weitere Person ändern behält Phasen, Rente und Pension; neue Person braucht einen Namen; eigene Geburtsdaten', () => {
  const a = ctx();
  a.run("openPersonSheet('p1')");
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /data-pv-remove="person"/);
  fill(a, { 'hp-name': 'Kim B.', 'hp-by': '1989' });
  assert.equal(submit(a), false);
  assert.deepEqual(a.json('getDrvExtra()[0]'), { ...KIM, name: 'Kim B.', by: 1989 });
  a.run('openPersonSheet(null)'); fill(a, { 'hp-name': '', 'hp-by': '1995' });
  assert.equal(submit(a), true, 'ohne Namen nicht gespeichert');
  assert.match(a.el('dsError').textContent, /Namen/);
  fill(a, { 'hp-name': 'Lu' });
  assert.equal(submit(a), false);
  assert.deepEqual(a.json('getDrvExtra().map(p=>[p.name,p.by])'), [['Kim B.', 1989], ['Lu', 1995]]);
  a.run("openPersonSheet('me')"); fill(a, { 'hp-name': '', 'hp-by': '2016', 'hp-bm': '7' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Geburtsjahr/);
  fill(a, { 'hp-by': '1980' });
  assert.equal(submit(a), false);
  assert.equal(a.run("appStorage.getItem('lt-birth-year')"), '1980'); assert.equal(a.run("appStorage.getItem('lt-birth-month')"), '7');
});

test('Person entfernen: Depots und Renten gehören danach dir, die Kinderzulage ebenfalls', async () => {
  const a = ctx();
  a.run("openPersonSheet('p1')");
  await a.run("_removePerson('p1')");
  assert.equal(a.run('_sheetOpen'), false);
  assert.deepEqual(a.json('getDrvExtra()'), []);
  assert.deepEqual(a.json('getAvDepots().map(d=>[d.id,d.person])'), [['d1', ''], ['d2', '']]);
  assert.equal(a.json("'person' in _lsJSON('lt-pensions',[])[0]"), false, 'gehört mir (ohne Person)');
  assert.equal(a.json("'parent' in getChildren()[0]"), false);
});

test('Kind-Sheet: ändern, anlegen nur mit Geburtsjahr, entfernen', async () => {
  const a = ctx();
  a.run("openChildSheet('c1')"); fill(a, { 'hc-name': 'Lena', 'hc-by': '2019', 'hc-bm': '5', 'hc-until': '25', 'hc-parent': 'p1' });
  assert.equal(submit(a), false);
  assert.deepEqual(a.json('getChildren()[0]'), { id: 'c1', name: 'Lena', by: 2019, bm: 5, until: 25, parent: 'p1' });
  a.run('openChildSheet(null)'); fill(a, { 'hc-name': 'Tom', 'hc-by': '', 'hc-bm': '', 'hc-until': '', 'hc-parent': '' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Geburtsjahr/);
  fill(a, { 'hc-by': '2022' }); assert.equal(submit(a), false);
  assert.deepEqual(a.json('getChildren().map(c=>c.name)'), ['Lena', 'Tom']);
  a.run("openChildSheet('c1')");
  a.run("_pvSheetClick({target:{closest:s=>s==='[data-pv-remove]'?{dataset:{pvRemove:'child'}}:null}})");
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(a.json('getChildren().map(c=>c.name)'), ['Tom']);
});

test('Gesetzliche Rente im Sheet: eigene mit Rechengrößen; weitere Person behält Name, Phasen und Pension; EM-Prüfung', () => {
  const a = ctx();
  a.run("openDrvSheet('me')");
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /Rechengrößen/);
  fill(a, { 'pv-points': '20', 'pv-salary': '30.000', 'pv-age': '', 'pv-deduct': '', 'pv-emType': '0', 'pv-rw': '42,52', 'pv-de': '51.944', 'pv-bbg': '101.400' });
  assert.equal(submit(a), false);
  assert.deepEqual(a.json("JSON.parse(appStorage.getItem('lt-drv'))"), { points: 20, salary: 30000, age: 0, deduct: 20, rw: 42.52, de: 51944, bbg: 101400 });
  a.run("openDrvSheet('p1')");
  assert.doesNotMatch(a.run("document.getElementById('dsBody').innerHTML"), /Rechengrößen/, 'gelten für alle, nur bei dir');
  fill(a, { 'pv-points': '11,5', 'pv-salary': '30.000', 'pv-emType': '0' });
  assert.equal(submit(a), false);
  const k = a.json('getDrvExtra()[0]');
  assert.equal(k.points, 11.5); assert.equal(k.name, 'Kim'); assert.equal(k.until, 60); assert.equal(k.w2, 50); assert.deepEqual(k.bv, KIM.bv);
  assert.equal('deduct' in k, false, 'leeres Feld = Standardwert');
  // Zurechnungszeit ohne Entgeltpunkte laut Bescheid: abgelehnt, nichts gespeichert
  const before = a.run("appStorage.getItem('lt-drv')");
  a.run("openDrvSheet('me')"); fill(a, { 'pv-points': '20', 'pv-salary': '30.000', 'pv-emType': '1', 'pv-emZz': '10', 'pv-emTotal': '', 'pv-rw': '42,52', 'pv-de': '51.944', 'pv-bbg': '101.400' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Entgeltpunkte laut Bescheid \(gesamt\)/);
  assert.equal(a.run("appStorage.getItem('lt-drv')"), before);
  // ungültige Zahl
  fill(a, { 'pv-emType': '0', 'pv-emZz': '', 'pv-points': 'zwanzig' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Rentenpunkte: bitte eine Zahl/);
});

test('Beamtenversorgung: neu für eine Person ohne, Bezüge Pflicht, entfernen', async () => {
  const a = ctx();
  set(a, 'lt-drv-extra', [{ ...KIM, bv: undefined }]);
  a.run('openBvSheet(null)');
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /<option value="me">Ich<\/option><option value="p1">Kim<\/option>/);
  fill(a, { 'pv-who': 'p1', 'pv-bvPay': '', 'pv-bvYears': '8', 'pv-bvAge': '', 'pv-bvFrom': '', 'pv-bvDeduct': '' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Bezüge/);
  fill(a, { 'pv-bvPay': '3.500' });
  assert.equal(submit(a), false);
  assert.deepEqual(a.json('getDrvExtra()[0].bv'), { pay: 3500, years: 8 });
  assert.match(a.run('_pensionSummaryHTML()'), /data-ds-open="bv" data-id="p1"/);
  a.run("openBvSheet('p1')");
  a.run("_pvSheetClick({target:{closest:s=>s==='[data-pv-remove]'?{dataset:{pvRemove:'bv'}}:null}})");
  await new Promise(r => setTimeout(r, 0));
  assert.equal('bv' in a.json('getDrvExtra()[0]'), false);
});

test('Altersvorsorgedepot: anlegen nur mit Beitrag oder Guthaben, Verknüpfung mit dem Vermögen bleibt', () => {
  const a = ctx();
  a.run('openAvdSheet(null)');
  fill(a, { 'pv-name': 'Neu', 'pv-person': 'p1', 'pv-contrib': '', 'pv-balance': '', 'pv-start': '', 'pv-ret': '', 'pv-from': '', 'pv-lump': '0', 'pv-deduct': '' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Beitrag oder ein Guthaben/);
  fill(a, { 'pv-contrib': '80' }); assert.equal(submit(a), false);
  const neu = a.json('getAvDepots()[2]');
  assert.match(neu.id, /^depot-/, 'ID vom Speicher'); delete neu.id;
  assert.deepEqual(neu, { name: 'Neu', person: 'p1', contrib: 80 });
  a.run("openAvdSheet('d2')");
  fill(a, { 'pv-name': 'Mein Depot', 'pv-person': 'gibt-es-nicht', 'pv-contrib': '175', 'pv-balance': '', 'pv-start': '', 'pv-ret': '', 'pv-from': '', 'pv-lump': '0', 'pv-deduct': '' });
  assert.equal(submit(a), false);
  const pos = a.run("_fc.fields.find(f=>f.category!=='liab').id");
  assert.deepEqual(a.json("getAvDepots().find(d=>d.id==='d2')"), { id: 'd2', name: 'Mein Depot', person: '', contrib: 175, pos });
});

test('Weitere Rente: Bezeichnung und Betrag Pflicht, Eintrag behält seine ID', () => {
  const a = ctx();
  const id = a.json("_lsJSON('lt-pensions',[])[0].id");
  a.run(`openPenSheet(${JSON.stringify(id)})`);
  fill(a, { 'pv-name': 'Betriebsrente Kim', 'pv-person': 'p1', 'pv-amount': '', 'pv-from': '65', 'pv-until': '' });
  assert.equal(submit(a), true); assert.match(a.el('dsError').textContent, /Betrag/);
  fill(a, { 'pv-amount': '220' }); assert.equal(submit(a), false);
  assert.deepEqual(a.json("_lsJSON('lt-pensions',[])"), [{ id, name: 'Betriebsrente Kim', amount: 220, from: 65, person: 'p1' }]);
});

test('Einnahmen & Ausgaben: automatische Posten als Zeilen, die zur Quelle führen; frühere Sprungziele öffnen Sheets', () => {
  const a = ctx(); a.run('requestAnimationFrame=f=>0');
  const auto = a.run('_autoBudgetHTML(_budgetYM())');
  assert.match(auto, /^<details class="ds-fold" data-fold="auto" ontoggle="_dsFoldToggle\(this\)"><summary class="ds-list-t ds-list-sum ds-fold-h"><span>Automatisch · /);
  const kinds = [...auto.matchAll(/data-ds-open="([^"]+)" data-id="([^"]*)"/g)].map(m => m[1] + ':' + m[2]);
  assert.ok(kinds.includes('child:c1'), kinds.join());
  assert.ok(kinds.includes('avd:d1') && kinds.includes('avd:d2'), kinds.join());
  assert.doesNotMatch(auto, /loan-budget/);
  a.run("_pvJump('drv:p1')"); assert.equal(a.run("document.getElementById('dsTitle').textContent"), 'Kim');
  a.run("_pvJump('pvMeDrv')"); assert.equal(a.run('_sheetCtx.pv.kind+":"+_sheetCtx.pv.id'), 'drv:me');
  a.run('_nsAvDepot()'); assert.equal(a.run("document.getElementById('dsTitle').textContent"), 'Neues Altersvorsorgedepot');
});

// 16.10.2026: Sondertilgungen im Kredit-Sheet: Termin und Betrag gleich breit und hoch nebeneinander, „Entfernen“ daneben
test('Sondertilgung im Sheet: drei Spalten, Felder gleich groß', () => {
  assert.match(html, /\.ds-sheet \.loan-extra-row\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) auto;align-items:end;gap:10px\}/);
  assert.match(html, /\.ds-sheet \.loan-extra-row \.ds-in,\.ds-sheet \.loan-extra-row \.num-input\{width:100%;box-sizing:border-box;height:40px;min-height:40px;/);
  const a = app(html);
  const row = a.run("_loanExtraHTML('k1',{id:'e1',month:'2026-03',amount:1000})");
  assert.match(row, /^<div class="loan-extra-row" data-extra-id="e1" data-extra-loan="k1"><label>Termin<button type="button" class="ds-in ds-date-btn"/);
  assert.match(row, /<label>Betrag €<input class="num-input" type="text" data-extra-amount value="1\.000"/);
  assert.match(row, /<button type="button" class="position-remove edit-only" data-extra-remove aria-label="Sondertilgung entfernen">Entfernen<\/button><\/div>$/);
});

// 16.10.2026: Unterbereiche von „Einnahmen & Ausgaben“ auf- und zuklappbar, damit der Bereich nicht überladen wirkt
test('Einnahmen & Ausgaben: Unterbereiche zugeklappt mit Anzahl und Ø, Zustand gespeichert, nach dem Speichern offen', () => {
  const a = app(html); a.csv(fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8')); a.context.CSS = { escape: String };
  let list = a.run('_budgetListHTML()');
  const folds = [...list.matchAll(/<details class="ds-fold" data-fold="([a-z]+)"( open)? ontoggle="_dsFoldToggle\(this\)"><summary class="ds-list-t ds-list-sum ds-fold-h"><span>([^<]+)<\/span><span>([^<]*)<\/span><\/summary>/g)].map(m => [m[1], !!m[2], m[3], m[4]]);
  assert.deepEqual(folds.map(f => f[0]), ['einkommen', 'fixe', 'variable', 'sparen', 'accounts', 'orders']);
  assert.ok(folds.every(f => !f[1]), 'Standard: alle zu');
  assert.match(folds[1][3], /^\d+ · Ø [\d.]+ € \/ Monat$/, 'Kopf: Anzahl und Ø');
  assert.match(list, /<\/details><button type="button" class="ds-add" data-ds-open="add-budget">\+ Einnahme oder Ausgabe<\/button>/, 'Hinzufügen bleibt sichtbar');
  // Auf- und Zuklappen wird gespeichert (im Dokument), unverändert schreibt nichts
  a.run("globalThis.__f={dataset:{fold:'fixe'},open:true};_dsFoldToggle(__f)");
  assert.equal(a.run("_uiOpen('bud-fixe')"), true);
  assert.equal(a.json('appStorage.document()').preferences.expandedSections['bud-fixe'], true);
  assert.match(a.run('_budgetListHTML()'), /data-fold="fixe" open/);
  const rev = a.run('appStorage.revision()'); a.run('_dsFoldToggle(__f)'); assert.equal(a.run('appStorage.revision()'), rev);
  // Neuer Sparposten: „Sparen“ ist danach offen
  a.run("selectedMonth='2026-10';openBudgetSheet()");
  for (const [k, v] of Object.entries({ 'b-mode': 'recurring', 'b-name': 'Bausparen', 'b-type': 'saving', 'b-amount': '100', 'b-rhythm': 'month' })) a.el(k).value = v;
  a.el('b-customOn').getAttribute = () => 'false';
  a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'), false, a.el('dsError').textContent);
  assert.match(a.run('_budgetListHTML()'), /data-fold="sparen" open/);
  // Prüfung offen: Daueraufträge offen
  a.run('_flowCheckOpen=true');
  assert.match(a.run('_moneyFlowHTML(loadBudgetData())'), /data-fold="orders" open/);
});

// 16.10.2026: Prognose & Annahmen (Daten-Seite) mit aufklappbaren Unterbereichen
test('Annahmen: vier Unterbereiche aufklappbar mit Zusammenfassung; „Annahmen prüfen“ öffnet Lebensplanung und Rendite', () => {
  const sec = html.slice(html.indexOf('id="v2-forecast-sec"'), html.indexOf('<!-- Einstellungen, Sicherung, Hilfe', html.indexOf('id="v2-forecast-sec"')));
  assert.ok(sec.includes('id="lt-asset-params-table"'), 'ganzer Abschnitt');
  const folds = [...sec.matchAll(/<details class="ds-fold as-fold" data-afold="([a-z]+)" ontoggle="_asFoldToggle\(this\)"><summary class="ds-list-t ds-list-sum ds-fold-h"><span>([^<]+)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(folds, [['plan', 'Lebensplanung'], ['phases', 'Lebensphasen'], ['events', 'Einmalige Ereignisse'], ['assets', 'Rendite &amp; Sparrate je Asset']]);
  assert.ok(sec.indexOf('id="lt-life-expect"') > sec.indexOf('data-afold="plan"') && sec.indexOf('id="lt-life-expect"') < sec.indexOf('data-afold="phases"'), 'Felder im Unterbereich');
  assert.match(sec, /<span class="as-i" data-info="lt-phases" role="button" tabindex="0" aria-label="Erklärung" onclick="event\.preventDefault\(\)"><\/span>/, 'Info ohne Auf-/Zuklappen');
  assert.ok(sec.indexOf('id="v2-prev-pct"') < sec.indexOf('data-afold="plan"'), 'Erfolgschance bleibt oben sichtbar');
  const a = app(html); a.csv(fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8'));
  a.run('_asFoldMeta()');
  assert.match(a.el('as-meta-plan').textContent, /^bis \d+ · Inflation [\d,]+ %$/);
  assert.match(a.el('as-meta-phases').textContent, /^(Vor)?[Rr]uhestand ab \d+/);
  assert.match(a.el('as-meta-events').textContent, /^(\d+|keine)$/);
  a.run("globalThis.__f={dataset:{afold:'assets'},open:true};_asFoldToggle(__f)");
  assert.equal(a.json('appStorage.document()').preferences.expandedSections['ass-assets'], true);
  assert.match(html, /run:\(\)=>_v2OpenForecastSettings\(\['plan','assets'\]\)/);
  assert.match(html, /if\(meta\)meta\.textContent=plan\.groups\.length\+' · '\+fmt\(totalSaving\)\+L\(' \/ Monat',' \/ month'\);/);
});
