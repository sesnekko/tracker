const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const child = require('node:child_process');
const Data = require('../data-store.js');
const root = path.resolve(__dirname, '..');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baselineHTML = child.execFileSync('git', ['show', '1f17a25:index.html'], { cwd: root, encoding: 'utf8' });
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
function imported(source = html, storage) {
  const a = app(source, storage); a.csv(demoCSV); return a;
}
const legacyApp = imported(baselineHTML);
const legacyValues = { ...legacyApp.storage.values };
function totals(a) {
  return a.json('Object.fromEntries(Object.entries(loadData()).map(([m,e])=>[m,calc(e)]))');
}
// Lebensphasen (Schema 10/11): Mit „Arbeitszeit 0 %“ und „Altersvorsorge 0 %“ beim Weiterarbeiten entspricht die Rechnung dem früheren Modell
// (zwischen „Sparen bis“ und „Ruhestand ab“ weder Sparen noch Rentenpunkte). Neue Phasenfelder fehlen im Vergleichsstand.
const PHASE_FIELDS = "['pensionAge','pensionSpending','p1Work','p2Saving','p2Work','p2Withdraw','p2Pension','p3Saving','p3Pension','phase2From','workEnd','phase4From','workRef']";
// Seit dem Umbau der Prognose auf Monatsschritte mit Haushalts-Cashflow (14.10.2026, Befunde P18–P29 in
// .docs/PROBLEME.md) rechnet die Simulation bewusst anders als der Vergleichsstand 1f17a25. Verglichen werden deshalb
// (1) die Eingaben des Modells mit dem alten Stand und (2) die Ergebnisse zwischen Migration und frischem Import im
// aktuellen Code. So bleibt belegt, dass die Migration nichts verliert, ohne einen fachlich falschen Sollwert festzuhalten.
const GROUP_FIELDS = "['key','cat','gross','debt','legacyDebt','ret','vol','retDyn','volDyn','saving','avail','tax','hasLoanModel']";
// zfPts, epNew, besitz: Kennwerte der Altersrente nach einer EM-Rente (Schema 18), keine Eingaben
const DRV_NEW = "['inp','rag','zf','zfMonths','zfPts','epNew','besitz','workEndMain','workUntil','by','net','netInBudget','personId','prof']";
function forecastInputs(a) {
  return a.json('(()=>{const p=buildPlan();const strip=d=>{d=Object.assign({},d);'+DRV_NEW+'.forEach(k=>delete d[k]);return d;};return {settings:Object.fromEntries(Object.entries(p.s).filter(([k])=>!'+PHASE_FIELDS+'.includes(k))),drv:strip(p.drv),extra:p.drvExtra.map(strip),groups:p.groups.map(g=>{const x={};'+GROUP_FIELDS+'.forEach(k=>x[k]=g[k]);x.loans=g.loans.map(l=>({bal:l.bal,rate:l.rate,pay:l.pay,extra:l.extra,follow:l.follow,fixedAge:l.fixedAge}));return x;})};})()');
}
function forecastResult(a) {
  return a.json('(()=>{const p=buildPlan();const det=simulatePlan(p,p.s.withdrawFrom,{record:true});return {det,mc:runMonteCarlo(p,p.s.withdrawFrom,true),retire:findRetireAge(p),target:targetCapital(p,p.s.withdrawFrom,det)};})()');
}
test('migration retains every month, value, quantity, budget and forecast result', () => {
  const a = app(html, new MemoryStorage(legacyValues));
  a.run("appStorage.setItem('lt-p2-work','0');appStorage.setItem('lt-p2-pension','0')");
  assert.deepEqual(totals(a), totals(legacyApp));
  assert.deepEqual(a.json('loadData()'), legacyApp.json('loadData()'));
  for (let m = 0; m < 12; m++) {
    const stripMetadata = c => JSON.parse(JSON.stringify(c, (k, v) => ['id', 'targetGroup', 'explicitTarget'].includes(k) ? undefined : v));
    assert.deepEqual(stripMetadata(a.json(`calcBudgetMonth(loadBudgetData(),${m})`)), stripMetadata(legacyApp.json(`calcBudgetMonth(loadBudgetData(),${m})`)));
  }
  // IDs are metadata; all simulation inputs remain numerically equal to the old model, results equal a fresh import.
  const stripIds = x => JSON.parse(JSON.stringify(x, (k, v) => k === 'id' ? undefined : v));
  assert.deepEqual(stripIds(forecastInputs(a)), stripIds(forecastInputs(legacyApp)));
  const fresh = imported(html); fresh.run("appStorage.setItem('lt-p2-work','0');appStorage.setItem('lt-p2-pension','0')");
  assert.deepEqual(stripIds(forecastResult(a)), stripIds(forecastResult(fresh)));
  assert.ok(a.storage.getItem(Data.KEY));
  assert.equal(a.storage.getItem('finData'), null);
});
test('actual CSV importer produces the same results in the new store', () => {
  const a = imported(html);
  a.run("appStorage.setItem('lt-p2-work','0');appStorage.setItem('lt-p2-pension','0')");
  assert.deepEqual(totals(a), totals(legacyApp));
  const stripIds = x => JSON.parse(JSON.stringify(x, (k, v) => k === 'id' ? undefined : v));
  assert.deepEqual(stripIds(forecastInputs(a)), stripIds(forecastInputs(legacyApp)));
});
test('one JSON file restores all data and preferences on a fresh device', () => {
  const source = Data.createStore(new MemoryStorage({ ...legacyValues, darkMode: '0', 'v2-modules': JSON.stringify({ budget: false, liab: false }), 'ui-open-flow': '1' }));
  const serialized = JSON.stringify(source.exportBackup(new FixedDate()));
  const targetStorage = new MemoryStorage({ unrelated: 'preserve' });
  const target = Data.createStore(targetStorage);
  target.importBackup(JSON.parse(serialized));
  assert.deepEqual(target.document(), source.document());
  assert.equal(target.getItem('darkMode'), '0');
  assert.equal(JSON.parse(target.getItem('v2-modules')).budget, false);
  assert.equal(target.getItem('ui-open-flow'), '1');
  assert.equal(targetStorage.getItem('unrelated'), 'preserve');
  const restarted = Data.createStore(targetStorage);
  assert.deepEqual(restarted.document(), source.document());
});
test('rename references and IDs survive ordinary updates, including people and events', () => {
  const store = Data.createStore(new MemoryStorage(legacyValues));
  const before = store.document();
  const etf = before.groups.find(g => g.name === 'ETF');
  store.renameGroup(etf.id, 'Langfristige Anlagen');
  const doc = store.document();
  const saving = doc.budget.items.find(b => b.name === 'ETF Sparpläne');
  assert.equal(saving.targetGroupId, etf.id);
  assert.equal(JSON.parse(store.getItem('budgetData')).sparen[0].targetGroup, 'Langfristige Anlagen');
  assert.equal(doc.forecast.events.find(e => e.name === 'Erbschaft').to.groupId, etf.id);
  assert.deepEqual(doc.groups.find(g => g.id === etf.id).assumptions, etf.assumptions);
  const p = doc.positions.find(p => p.category === 'etf');
  store.renamePosition(p.id, 'Mein Fonds');
  assert.equal(store.document().snapshots[0].positions.find(v => v.positionId === p.id).value, 775);
  store.setItem('lt-inflation', '2.5');
  assert.equal(store.document().positions.find(x => x.id === p.id).name, 'Mein Fonds');
  assert.deepEqual(store.document().forecast.events, doc.forecast.events);
  assert.deepEqual(store.document().retirement.people, doc.retirement.people);
});
test('no loss of primary identity and names with punctuation during updates', () => {
  const store = Data.createStore(new MemoryStorage(legacyValues));
  const doc = store.document();
  doc.retirement.primary.id = 'person-owner'; doc.retirement.primary.name = 'Max & Anna';
  doc.positions[0].name = 'Konto; "Rücklage"\nPrivat';
  store.importBackup(doc); store.setItem('lt-inflation', '3');
  assert.deepEqual(store.document().retirement.primary, doc.retirement.primary);
  assert.equal(store.document().positions[0].name, doc.positions[0].name);
});
test('missing and zero assumptions remain distinct; fractional quantities are exact', () => {
  const store = Data.createStore(new MemoryStorage(legacyValues));
  const ap = JSON.parse(store.getItem('lt-asset-params'));
  delete ap.ETF.ret; ap.ETF.tax = 0;
  store.setItem('lt-asset-params', JSON.stringify(ap));
  const a = store.document().groups.find(g => g.name === 'ETF').assumptions;
  assert.equal(Object.hasOwn(a, 'returnPercent'), false);
  assert.equal(a.withdrawalDeductionPercent, 0);
  const btc = store.document().positions.find(p => p.name === 'Bitcoin');
  assert.equal(store.document().snapshots[0].positions.find(p => p.positionId === btc.id).quantity, 0.0113);
});
test('archived custom positions retain history without contributing to totals', () => {
  const store = Data.createStore(new MemoryStorage(legacyValues));
  const config = JSON.parse(store.getItem('fieldConfig'));
  const removed = config.fields[0]; config.fields.shift();
  store.setItem('fieldConfig', JSON.stringify(config));
  const doc = store.document();
  assert.equal(doc.positions.find(p => p.id === removed.id).archived, true);
  assert.equal(doc.snapshots[0].positions.find(v => v.positionId === removed.id).value, 8000);
  const restored = Data.createStore(new MemoryStorage()); restored.importBackup(store.exportBackup());
  assert.deepEqual(restored.document(), doc);
  assert.equal(JSON.parse(restored.getItem('finData'))['2024-01'].cash, 3700);
});
test('aggregate-only early data and separate custom fields migrate without loss', () => {
  const store = Data.createStore(new MemoryStorage({
    finData: JSON.stringify({ '2020-01': { cash: 123.45, liab: 50 } }),
    customFields: JSON.stringify([{ id: 'custom-1', label: 'Rücklage', category: 'cash' }])
  }));
  const doc = store.document();
  assert.equal(doc.snapshots[0].positions.reduce((n, p) => n + p.value, 0), 173.45);
  assert.equal(JSON.parse(store.getItem('finData'))['2020-01'].cash, 123.45);
  assert.ok(doc.positions.some(p => p.id === 'custom-1'));
});
test('malformed/future/duplicate/broken reference JSON never changes saved data', () => {
  const storage = new MemoryStorage(legacyValues);
  const store = Data.createStore(storage);
  for (const mutate of [
    d => { d.schemaVersion = 99; },
    d => { d.positions.push(d.positions[0]); },
    d => { d.positions[0].groupId = 'missing'; },
    d => { d.snapshots[0].month = '2024-13'; },
    d => { d.snapshots[0].positions[0].value = '8000'; },
    d => { d.budget.items[0].monthlyAmounts.pop(); },
    d => { d.preferences.modules.budget = 'false'; },
    d => { d.forecast.events[0].to = { type: 'liquid' }; },
    d => { d.extraData = 'must not be silently discarded'; }
  ]) {
    const raw = storage.getItem(Data.KEY), old = store.document(), bad = store.exportBackup();
    mutate(bad); assert.throws(() => store.importBackup(bad));
    assert.equal(storage.getItem(Data.KEY), raw); assert.deepEqual(store.document(), old);
  }
  assert.throws(() => Data.validate(JSON.parse('{"__proto__":{}}')));
});
test('quota failures are atomic for migration, edits and restore', () => {
  const old = new MemoryStorage(legacyValues); old.failWrites = true;
  assert.throws(() => Data.createStore(old)); assert.deepEqual(old.values, legacyValues);
  const storage = new MemoryStorage(legacyValues), store = Data.createStore(storage), saved = store.document();
  storage.failWrites = true;
  assert.throws(() => store.setItem('lt-inflation', '9'));
  assert.deepEqual(store.document(), saved);
  const newDoc = store.exportBackup(); newDoc.preferences.theme = 'light';
  assert.throws(() => store.importBackup(newDoc)); assert.deepEqual(store.document(), saved);
});
test('transactions roll back malformed CSV after partial parsing', () => {
  const a = imported(html), raw = a.storage.getItem(Data.KEY);
  a.csv('Typ;Monat;Testkonto\nVermoegen;2027-13;100\nTyp;Schlüssel;Wert\nPrognose;inflation;3');
  assert.equal(a.storage.getItem(Data.KEY), raw);
  assert.match(a.el('csvMsg').textContent, /bisherige Datenbestand bleibt/);
  assert.equal(a.json('_fc.fields').length, 11);
  a.csv('not a backup\nno recognizable rows'); assert.equal(a.storage.getItem(Data.KEY), raw);
  a.run("appStorage.setItem('lt-inflation','2.5')");
  assert.equal(a.json('getLifetimeSettings().inflation'), 2.5);
});
test('quoted legacy CSV and explicit zero import correctly', () => {
  const a = app(html);
  a.csv('Typ;Monat;"Konto; Rücklage"\nVermoegen;2026-01;0\nVermoegen;2026-02;123,45');
  assert.equal(a.json('_fc.fields[0].label'), 'Konto; Rücklage');
  assert.equal(a.json('calc(loadData()["2026-02"]).net'), 123.45);
  assert.deepEqual(a.json('parseCsvRows(\'a;"b\\nline";"c""d"\',";")'), [['a', 'b\nline', 'c"d']]);
});

test('actual export and JSON upload handlers support settings-only backups and cancellation', async () => {
  const a = app(html);
  a.run("appStorage.setItem('darkMode','0');downloadJSON=(doc,name)=>{captured={doc,name};};exportBackup();");
  const captured = a.json('captured');
  assert.match(captured.name, /^master_export_2026-10-08\.json$/);
  assert.equal(captured.doc.snapshots.length, 0);
  assert.equal(captured.doc.preferences.theme, 'light');
  const b = imported(html);
  b.context.upload = { target: { files: [{ name: captured.name, text: async () => JSON.stringify(captured.doc) }], value: captured.name } };
  b.run('_ask=async()=>false');
  const before = b.storage.getItem(Data.KEY);
  await b.run('handleDataUpload(upload)');
  assert.equal(b.storage.getItem(Data.KEY), before);
  b.run('_ask=async()=>true');
  await b.run('handleDataUpload(upload)');
  assert.deepEqual(b.json('appStorage.document().preferences'), captured.doc.preferences);
  assert.equal(b.json('Object.keys(loadData()).length'), 0);
  b.context.upload.target.files[0].text = async () => '{malformed';
  const restored = b.storage.getItem(Data.KEY);
  await b.run('handleDataUpload(upload)');
  assert.equal(b.storage.getItem(Data.KEY), restored);
  assert.match(b.el('csvMsg').textContent, /nicht verändert/);
});
test('saved budget targets survive names and explicit unassigned rows stay unassigned', () => {
  const a = imported(html);
  const doc = a.json('appStorage.document()');
  const saving = doc.budget.items.find(b => b.name === 'ETF Sparpläne');
  saving.name = 'Langfristige Rücklage';
  a.context.backup = doc; a.run('appStorage.importBackup(backup);_fc=loadFieldConfig();');
  assert.equal(a.json('deriveSavingsFromBudget(buildPlan()).byGroup.ETF'), 500);
  saving.targetGroupId = null;
  a.run('appStorage.importBackup(backup);_fc=loadFieldConfig();');
  assert.equal(a.json('deriveSavingsFromBudget(buildPlan()).byGroup.ETF ?? null'), null);
  assert.ok(a.json('deriveSavingsFromBudget(buildPlan()).unmatched').includes(saving.name));
});
test('bundled JSON demo restores a complete household without double counting loan payments', () => {
  /* Erwartungen aus demo_backup.json (in der App bearbeitete Demo vom 13.10.2026, normalisiert mit .scripts/build-demo.cjs).
     Budgetwerte unabhängig aus den Posten nachgerechnet: Januar 2026 Einnahmen 3.200 + 1.800 + 259 (Kindergeld für Lena,
     automatisch aus dem Kind, § 66 EStG; der frühere Posten „Kindergeld“ 250 € entfällt) + 125 = 5.384 €,
     Ausgaben 701 € fix + 960 € variabel, Kreditraten laut Vertrag 1.200 + 400 + 250 = 1.850 €, Sparen 500 + 50 + 250 + 25
     = 825 € (der Posten „Altersvorsorge-Beiträge“ auf die archivierte Gruppe ist seit DEMO-6 entfernt, Entscheidung 14.10.2026). */
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'demo_backup.json'), 'utf8'));
  Data.validate(doc);
  const a = app(html); a.context.demo = doc;
  a.run("appStorage.importBackup(demo);_fc=loadFieldConfig();selectedMonth='2026-10';ensureNextMonth();");
  // Die Demo-Datei bleibt in dieser Runde unverändert (Schema 15, Review-Runde P34–P38 ändert keine Demo-Dateien);
  // ältere Schemas lädt die App verlustfrei und speichert sie in der aktuellen Version.
  assert.ok(doc.schemaVersion >= 15 && doc.schemaVersion <= Data.VERSION);
  assert.equal(a.json('appStorage.document().schemaVersion'), Data.VERSION);
  assert.equal(doc.exportedAt, undefined);
  assert.equal(doc.snapshots.length, 34);
  assert.equal(doc.snapshots.at(-1).month, '2026-10', 'kein Live-Monat in der Demo; die App legt ihn beim Öffnen an');
  assert.equal(doc.positions.length, 19);
  assert.deepEqual(doc.positions.filter(p => p.category === 'stock').map(p => p.name), ['Apple', 'Amazon', 'Nestlé']);
  assert.ok(['bitcoin', 'crypto', 'stock', 'vehicle', 'realEstate'].every(category => doc.positions.some(p => p.category === category)));
  // ETFs, Bitcoin, Aktien und Ethereum mit Live-Kurs (gespeicherter Kurs als Rückfall ohne Netz), alles andere manuell.
  assert.deepEqual(doc.positions.filter(p => p.valuation === 'market').map(p => p.id), ['msci-world-a0rpwh', 's-p-500-a0yedg', 'bitcoin', 'aktie-apple', 'aktie-amazon', 'aktie-nestle', 'ethereum']);
  assert.ok(doc.positions.filter(p => p.valuation === 'market').every(p => p.instrument && p.lastQuote && p.lastQuote.priceEUR > 0));
  // Vermögenswerte ohne Kurs sind manuell bewertet; Verbindlichkeiten haben keine Bewertungsart („Kredit Garagen“ wurde in der App angelegt)
  assert.ok(doc.positions.filter(p => p.valuation !== 'market' && p.category !== 'liab').every(p => p.valuation === 'manual'));
  assert.ok(doc.positions.find(p => p.id === 'familienauto').depreciation, 'car keeps its monthly depreciation');
  assert.ok(doc.accounts.every(p => p.iban === ''));
  // Personen (Schema 14): Gehälter sind ihren Personen zugeordnet, das Kind ist eine Person mit Kinderzulage bei Anna
  assert.equal(doc.budget.items.find(i => i.name === 'Nettogehalt Anna').personId, doc.retirement.people[0].id);
  assert.equal(doc.budget.items.find(i => i.name === 'Nettogehalt Max').personId, doc.retirement.primary.id);
  assert.deepEqual(doc.retirement.children, [{ id: 'child-1', name: 'Lena', birthYear: 2019, allowanceParentId: doc.retirement.people[0].id }]);
  assert.ok(!doc.budget.items.some(i => /kindergeld/i.test(i.name)), 'Kindergeld kommt automatisch');
  assert.equal(a.json("loadData()['2024-01']._details['kredit-wohnung']"), 239500);
  assert.equal(a.json("loadData()['2024-12']._details['kredit-auto']"), 0);
  assert.equal(a.json("loadData()['2025-01']._details['kredit-auto']"), 19700);
  const jan = a.json('calcBudgetMonth(loadBudgetData(),0)');
  const aug = a.json('calcBudgetMonth(loadBudgetData(),7)');
  assert.equal(jan.einnahmen, 5384);
  assert.equal(jan.sparplaene, 825);
  assert.equal(Math.round(jan.frei), 5384 - 1661 - 1850 - 825);
  // August 2026: Sondertilgung 2.500 € für die Wohnung
  assert.equal(Math.round(aug.frei), 5384 - 1661 - 1850 - 825 - 2500);
  // Kein Sparposten zielt auf eine Gruppe ohne aktive Position (P15/DEMO-6)
  const active = new Set(doc.positions.filter(p => !p.archived).map(p => p.groupId));
  assert.deepEqual(doc.budget.items.filter(i => i.kind === 'saving' && i.targetGroupId && !active.has(i.targetGroupId)).map(i => i.name), []);
  assert.equal(jan.fixItems.filter(p => p.automatic).length, 3, 'drei Kreditverträge, jede Rate genau einmal');
  const target = app(html); target.context.demo = a.json('appStorage.exportBackup()');
  target.run('appStorage.importBackup(demo);_fc=loadFieldConfig();');
  assert.deepEqual(totals(target), totals(a));
  assert.deepEqual(target.json('appStorage.document().loans'), doc.loans);
});
test('archived empty entities, accounts and legacy loan parameters retain identity', () => {
  const store = Data.createStore(new MemoryStorage(legacyValues));
  const doc = store.document();
  doc.positions.push({ id: 'custom-empty', name: 'Archiviert', category: 'cash', groupId: doc.groups[0].id, archived: true, custom: true, ticker: null, unit: null });
  doc.groups.push({ id: 'group-empty', name: 'Später', assumptions: {} });
  const account = doc.accounts[0]; account.name = 'Umbenanntes Konto';
  store.importBackup(doc); store.setItem('lt-inflation', '2.5');
  assert.ok(store.document().positions.some(p => p.id === 'custom-empty'));
  assert.ok(store.document().groups.some(g => g.id === 'group-empty'));
  assert.equal(store.document().accounts[0].id, account.id);
  assert.equal(JSON.parse(store.getItem('budgetData')).standingOrders[0].from, account.name);
  const values = { ...legacyValues, loanParams: '{}' };
  const params = JSON.parse(values['lt-asset-params']); params.Immobilien.loanRate = 3; params.Immobilien.loanPay = 1000;
  values['lt-asset-params'] = JSON.stringify(params);
  const migrated = Data.createStore(new MemoryStorage(values));
  assert.equal(migrated.document().loans[0].interestPercent, 3);
  assert.equal(Object.hasOwn(migrated.document().groups.find(g => g.name === 'Immobilien').assumptions, 'legacyLoanRatePercent'), false);
});
test('renaming a group preserves its unspecified calculation defaults', () => {
  const a = imported(html);
  a.run("const params=JSON.parse(appStorage.getItem('lt-asset-params'));delete params.Bitcoin;appStorage.setItem('lt-asset-params',JSON.stringify(params));");
  assert.equal(a.json("getAssetParam({},'Bitcoin','ret','other')"), 15);
  a.run("appStorage.renameGroup(appStorage.document().groups.find(g=>g.name==='Bitcoin').id,'Digitale Rücklage');_fc=loadFieldConfig();");
  assert.equal(a.json("getAssetParam({},'Digitale Rücklage','ret','other')"), 15);
  assert.equal(a.json("getAssetParam({},'Digitale Rücklage','volDyn','other')"), -3);
  const restored = app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(a.json('appStorage.document()')) }));
  assert.equal(restored.json("getAssetParam({},'Digitale Rücklage','ret','other')"), 15);
});
