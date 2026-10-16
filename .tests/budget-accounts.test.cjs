/* 16.10.2026, Schema 20: Konten im Geldfluss. Budgetposten, Kredite (Rate), Kinder (Kindergeld) und Altersvorsorgedepots
   (Beitrag) können einem Konto zugeordnet werden. Unter Daueraufträge prüft die App, ob die Daueraufträge die Geldflüsse
   passend verteilen (Ø je Monat und Konto, Puffer für Spitzenmonate); ohne Daueraufträge ermittelt sie einen Vorschlag
   mit möglichst wenigen Aufträgen, der sich mit „Übernehmen“ anlegen lässt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, MemoryStorage } = require('./app-harness.cjs');
const Data = require('../data-store.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const all = v => Array(12).fill(v);
const item = (id, name, category, kind, months, accountId) => ({ id, name, category, subcategory: '', kind, targetGroupId: null, monthlyAmounts: months, ...(accountId ? { accountId } : {}) });
function doc(items, orders = []) {
  const d = Data.empty();
  d.groups = [{ id: 'g1', name: 'ETF', assumptions: {} }];
  d.accounts = [{ id: 'account-1', name: 'Gehalt Max', iban: '' }, { id: 'account-2', name: 'Gehalt Anna', iban: '' }, { id: 'account-3', name: 'Haushalt', iban: '' }, { id: 'account-4', name: 'Lastschriften', iban: '' }, { id: 'account-5', name: 'Depot', iban: '' }];
  d.budget = { items, standingOrders: orders, oneTime: [] };
  return d;
}
const household = () => [
  item('b1', 'Gehalt Max', 'einkommen', 'income', all(3200), 'account-1'),
  item('b2', 'Gehalt Anna', 'einkommen', 'income', all(1800), 'account-2'),
  item('b3', 'Miete', 'fixe', 'expense', all(2800), 'account-4'),
  item('b4', 'Lebensmittel', 'variable', 'expense', all(580), 'account-3'),
  item('b5', 'ETF Sparplan', 'sparen', 'saving', all(830), 'account-5')
];
const ctx = d => { const a = app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(d) })); a.context.CSS = { escape: String }; return a; };

test('Speicher: Kontoname in den App-Werten, Konto-ID im Dokument, für Posten, Kredit, Kind und Depot', () => {
  const s = Data.createStore(new MemoryStorage());
  s.importBackup(doc(household()));
  // Budgetposten: App-Werte mit Namen
  const bd = JSON.parse(s.getItem('budgetData'));
  assert.equal(bd.einkommen[0].account, 'Gehalt Max');
  assert.equal(bd.sparen[0].account, 'Depot');
  // Kind und Depot über ihre App-Werte
  s.setItem('lt-children', JSON.stringify([{ name: 'Lena', by: 2019, account: 'Haushalt' }]));
  s.setItem('lt-av-depots', JSON.stringify([{ name: 'AV', contrib: 50, account: 'Depot' }]));
  const d = s.document();
  assert.equal(d.schemaVersion, Data.VERSION); assert.equal(Data.VERSION, 20);
  assert.equal(d.budget.items.find(i => i.id === 'b1').accountId, 'account-1');
  assert.equal(d.retirement.children[0].accountId, 'account-3');
  assert.equal(d.retirement.pensionDepots[0].accountId, 'account-5');
  // Rundreise über die Sicherung
  const b = Data.createStore(new MemoryStorage()); b.importBackup(JSON.parse(JSON.stringify(s.exportBackup())));
  assert.equal(JSON.parse(b.getItem('lt-children'))[0].account, 'Haushalt');
  assert.equal(JSON.parse(b.getItem('lt-av-depots'))[0].account, 'Depot');
  assert.equal(JSON.parse(b.getItem('budgetData')).fixe[0].account, 'Lastschriften');
  // unbekannter Kontoname entfällt (kein toter Verweis)
  s.setItem('lt-children', JSON.stringify([{ name: 'Lena', by: 2019, account: 'Gibt es nicht' }]));
  assert.equal(s.document().retirement.children[0].accountId, undefined);
});

test('Kredit: Konto der Rate wird gespeichert', () => {
  const d = doc(household());
  d.positions = [{ id: 'kredit', name: 'Kredit', category: 'liab', groupId: 'g1', archived: false, custom: true, ticker: null, unit: null }];
  d.loans = [{ positionId: 'kredit', interestPercent: 3, monthlyPayment: 500, accountId: 'account-4' }];
  const s = Data.createStore(new MemoryStorage()); s.importBackup(d);
  assert.equal(JSON.parse(s.getItem('loanParams')).kredit.account, 'Lastschriften');
  assert.equal(s.document().loans[0].accountId, 'account-4');
});

test('Prüfung: Schema 19 ohne Konten bleibt gültig; unbekanntes Konto oder Konto in Schema 19 abgelehnt', () => {
  const ok = doc(household().map(i => { const x = { ...i }; delete x.accountId; return x; })); ok.schemaVersion = 19;
  assert.doesNotThrow(() => Data.validate(ok));
  const s = Data.createStore(new MemoryStorage()); s.importBackup(ok);
  assert.equal(s.document().schemaVersion, 20, 'auf Schema 20 gehoben, Inhalt unverändert');
  const old = doc(household()); old.schemaVersion = 19;
  assert.throws(() => Data.validate(old), /accountId|unbekannt/);
  const bad = doc([item('b1', 'Gehalt', 'einkommen', 'income', all(1000), 'account-9')]);
  assert.throws(() => Data.validate(bad), /Konto/);
});

test('Budget-Sheet: Konto wählen und speichern; ohne Konten keine Auswahl', () => {
  const a = ctx(doc(household()));
  a.run("selectedMonth='2026-10';openBudgetSheet({ref:'fixe:b3'})");
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /<label class="ds-row" id="b-accountRow"><span class="ds-l" id="b-accountLabel">Abbuchung von<\/span><select class="ds-in ds-wide" id="b-account"><option value="">Kein Konto<\/option>.*<option value="Lastschriften" selected>/);
  for (const [k, v] of Object.entries({ 'b-name': 'Miete', 'b-type': 'expense', 'b-cost': 'fixe', 'b-amount': '2.800', 'b-rhythm': 'month', 'b-account': 'Haushalt' })) a.el(k).value = v;
  a.el('b-customOn').getAttribute = () => 'false';
  a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'), false, a.el('dsError').textContent);
  assert.equal(a.json('appStorage.document()').budget.items.find(i => i.name === 'Miete').accountId, 'account-3');
  const none = ctx((() => { const d = doc(household()); d.accounts = []; d.budget.items = d.budget.items.map(i => { const x = { ...i }; delete x.accountId; return x; }); return d; })());
  assert.equal(none.run("_accountSelectHTML('b-account','Abbuchung von','','')"), '');
});

test('Konto umbenennen und löschen: Verweise in Posten, Kredit, Kind und Depot ziehen mit', async () => {
  const a = ctx(doc(household()));
  a.run("appStorage.setItem('lt-children',JSON.stringify([{name:'Lena',by:2019,account:'Haushalt'}]));appStorage.setItem('lt-av-depots',JSON.stringify([{name:'AV',contrib:50,account:'Haushalt'}]))");
  a.run("openAccountSheet('Haushalt')");
  a.el('a-name').value = 'Familienkonto'; a.el('a-iban').value = '';
  a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'), false, a.el('dsError').textContent);
  assert.equal(a.json('loadBudgetData()').variable[0].account, 'Familienkonto');
  assert.equal(a.json("_lsJSON('lt-children',[])")[0].account, 'Familienkonto');
  assert.equal(a.json("_lsJSON('lt-av-depots',[])")[0].account, 'Familienkonto');
  assert.equal(a.run("_accountRefCount(loadBudgetData(),'Familienkonto')"), 3);
  a.run("openAccountSheet('Familienkonto')");
  await a.run('_deleteAccount()');
  assert.equal(a.json('loadBudgetData()').variable[0].account, undefined);
  assert.equal(a.json("_lsJSON('lt-children',[])")[0].account, undefined);
  assert.equal(a.json('appStorage.document()').budget.items.find(i => i.id === 'b4').accountId, undefined);
});

test('Geldfluss je Konto: Ø rein/raus, Status, Puffer für eine Jahreszahlung, Posten ohne Konto', () => {
  const items = household();
  items.push(item('b6', 'Kfz-Versicherung', 'fixe', 'expense', [0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'account-3'));
  items.push(item('b7', 'Strom', 'fixe', 'expense', all(90)));
  const orders = [
    { id: 'o1', from: { type: 'account', accountId: 'account-1' }, to: { type: 'account', accountId: 'account-4' }, amount: 2800 },
    { id: 'o2', from: { type: 'account', accountId: 'account-2' }, to: { type: 'account', accountId: 'account-3' }, amount: 630 },
    { id: 'o3', from: { type: 'account', accountId: 'account-2' }, to: { type: 'account', accountId: 'account-5' }, amount: 800 }
  ];
  const a = ctx(doc(items, orders));
  const f = a.json('(()=>{const f=_accountFlows(loadBudgetData());f.list.forEach(x=>delete x.inLabels);return f;})()');
  const by = Object.fromEntries(f.list.map(x => [x.name, x]));
  assert.equal(by['Gehalt Max'].status, 'surplus'); assert.equal(Math.round(by['Gehalt Max'].net), 400);
  assert.equal(by['Lastschriften'].status, 'ok');
  assert.equal(by['Depot'].status, 'short'); assert.equal(Math.round(by['Depot'].net), -30);
  // Haushalt: 630 rein, 580 + 600/12 = 630 raus → passt; im März fehlen 600 auf einen Schlag → Puffer
  assert.equal(by['Haushalt'].status, 'ok');
  assert.ok(Math.abs(by['Haushalt'].buffer - 550) < 1, 'Puffer ' + by['Haushalt'].buffer);
  assert.equal(by['Haushalt'].bufMonth, 2);
  assert.deepEqual(f.unassigned.out.map(([l, v]) => [l, Math.round(v)]), [['Strom', 90]]);
  const h = a.run("_flowCheckHTML(loadBudgetData())");
  assert.match(h, /Ein Konto reicht nicht/);
  assert.match(h, /Depot<small>rein 800 € · raus 830 €<\/small><\/span><span class="fc-st short">fehlt 30 €<\/span>/);
  assert.match(h, /Haushalt<small>rein 630 € · raus 630 € · Puffer 550 € bis März<\/small><\/span><span class="fc-st ok">passt<\/span>/);
  assert.match(h, /Ohne Konto: 1 Posten, raus Ø 90 € \(Strom\)/);
});

test('Dauerauftrag von außen (Kindergeld), dessen Einnahme schon zugeordnet ist, zählt nicht doppelt', () => {
  const items = [item('b1', 'Kindergeld Lena', 'einkommen', 'income', all(259), 'account-3'), item('b2', 'Lebensmittel', 'variable', 'expense', all(259), 'account-3')];
  const orders = [{ id: 'o1', from: { type: 'label', name: 'Kindergeld' }, to: { type: 'account', accountId: 'account-3' }, amount: 250 }];
  const a = ctx(doc(items, orders));
  const r = a.json("(()=>{const f=_accountFlows(loadBudgetData());return{net:Math.round(f.list.find(x=>x.name==='Haushalt').net),dup:f.dupOrders.length};})()");
  assert.deepEqual(r, { net: 0, dup: 1 });
  assert.match(a.run("_flowCheckHTML(loadBudgetData())"), /Dauerauftrag „Kindergeld → Haushalt“ nicht mitgezählt/);
  // ohne Zuordnung deckt der Dauerauftrag die Einnahme ab: nicht unter „ohne Konto“
  const b = ctx(doc([item('b1', 'Kindergeld Lena', 'einkommen', 'income', all(259))], orders));
  assert.deepEqual(b.json('_accountFlows(loadBudgetData()).unassigned.in'), []);
});

test('Vorschlag ohne Daueraufträge: Überschuss zu gleichen Teilen auf den Eingangskonten, wenige Aufträge; Übernehmen legt sie an', async () => {
  const a = ctx(doc(household()));
  a.run("haptic=()=>{};_toast=()=>{}");
  const sg = a.json('_suggestOrders(loadBudgetData())');
  assert.equal(sg.reason, 'ok');
  // 5.000 € Einnahmen, 4.210 € Bedarf auf Lastschriften, Depot, Haushalt → 790 € Überschuss, je Eingangskonto 395 €
  assert.deepEqual(sg.orders, [
    { from: 'Gehalt Max', to: 'Haushalt', amount: 580 },
    { from: 'Gehalt Max', to: 'Depot', amount: 830 },
    { from: 'Gehalt Max', to: 'Lastschriften', amount: 1400 },
    { from: 'Gehalt Anna', to: 'Lastschriften', amount: 1400 }
  ]);
  assert.deepEqual(sg.kept, [{ name: 'Gehalt Max', keep: 390 }, { name: 'Gehalt Anna', keep: 400 }], 'gleich bis auf die 10-€-Rundung');
  const h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /Der nicht eingeplante Überschuss bleibt zu gleichen Teilen auf den Eingangskonten/);
  assert.match(h, /Danach bleibt auf den Eingangskonten je Monat: Gehalt Max ≈ 390 €, Gehalt Anna ≈ 400 €\./);
  assert.match(h, /data-flow-apply>Übernehmen<\/button><\/div>$/, 'ohne Daueraufträge: kein „Zurück“');
  assert.equal(await a.run('_applySuggestedOrders()'), true);
  const d = a.json('appStorage.document()');
  assert.deepEqual(d.budget.standingOrders.map(o => [o.from.accountId, o.to.accountId, o.amount]), [['account-1', 'account-3', 580], ['account-1', 'account-5', 830], ['account-1', 'account-4', 1400], ['account-2', 'account-4', 1400]]);
  assert.ok(a.json('_accountFlows(loadBudgetData()).list').every(x => x.status !== 'short'));
});

test('Gleicher Anteil: ein Eingangskonto mit kleinerem Überschuss behält ihn ganz', () => {
  const a = ctx(doc([
    item('b1', 'Gehalt Max', 'einkommen', 'income', all(4000), 'account-1'),
    item('b2', 'Minijob Anna', 'einkommen', 'income', all(300), 'account-2'),
    item('b3', 'Miete', 'fixe', 'expense', all(2800), 'account-4')
  ]));
  const sg = a.json('_suggestOrders(loadBudgetData())');
  // Überschuss 1.500 €: Anna hat nur 300 € und behält sie, Max behält die übrigen 1.200 €
  assert.deepEqual(sg.orders, [{ from: 'Gehalt Max', to: 'Lastschriften', amount: 2800 }]);
  assert.deepEqual(sg.kept, [{ name: 'Gehalt Max', keep: 1200 }, { name: 'Gehalt Anna', keep: 300 }]);
});

test('Neue Daueraufträge vorschlagen bei bestehenden: ersetzt nach Rückfrage die Aufträge zwischen Konten, Aufträge von außen bleiben', async () => {
  const d = doc(household(), [
    { id: 'o1', from: { type: 'account', accountId: 'account-1' }, to: { type: 'account', accountId: 'account-4' }, amount: 2000 },
    { id: 'o2', from: { type: 'label', name: 'Kindergeld' }, to: { type: 'account', accountId: 'account-3' }, amount: 250 }
  ]);
  const a = ctx(d);
  a.run("haptic=()=>{};_toast=()=>{};globalThis.__asks=[];_ask=async o=>{__asks.push(o);return true;}");
  assert.match(a.run('_flowCheckHTML(loadBudgetData())'), /data-flow-propose>Neue Daueraufträge vorschlagen<\/button><\/div>$/);
  a.run('_dataClick({target:{closest:s=>s===\'[data-flow-propose]\'?{}:null}})');
  assert.equal(a.run('_flowPropose'), true);
  const h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /data-flow-apply>Übernehmen und ersetzen<\/button><button[^>]*data-flow-propose-cancel>Zurück zur Prüfung<\/button><\/div>$/);
  // Kindergeld von außen zählt im Vorschlag mit (Haushalt braucht 330 statt 580 €) und bleibt erhalten
  const sg = a.json('_suggestOrders(loadBudgetData())');
  assert.equal(sg.orders.find(o => o.to === 'Haushalt').amount, 330);
  assert.deepEqual(sg.keep.map(o => o.from), ['Kindergeld']);
  assert.equal(await a.run('_applySuggestedOrders()'), true);
  assert.match(a.json('__asks')[0].text, /^Ein Dauerauftrag zwischen deinen Konten wird durch \d+ neue ersetzt\. Daueraufträge von oder nach außen \(z\. B\. Kindergeld\) bleiben\.$/);
  const orders = a.json('loadBudgetData().standingOrders');
  assert.ok(orders.some(o => o.from === 'Kindergeld' && o.amount === 250), 'Kindergeld bleibt');
  assert.ok(!orders.some(o => o.id === 'o1'), 'alter Auftrag ersetzt');
  assert.equal(a.run('_flowPropose'), false, 'zurück zur Prüfung');
  // Abbrechen der Rückfrage: nichts geändert
  const b = ctx(d);
  b.run("haptic=()=>{};_toast=()=>{};_ask=async()=>false");
  assert.equal(await b.run('_applySuggestedOrders()'), false);
  assert.equal(b.json('loadBudgetData().standingOrders').length, 2);
});

test('Vorschlag: Gründe ohne Ergebnis und Teilergebnis', () => {
  const noItems = ctx(doc(household().map(i => { const x = { ...i }; delete x.accountId; return x; })));
  assert.equal(noItems.json('_suggestOrders(loadBudgetData())').reason, 'no-items');
  const balanced = ctx(doc([item('b1', 'Gehalt', 'einkommen', 'income', all(2000), 'account-1'), item('b2', 'Miete', 'fixe', 'expense', all(900), 'account-1')]));
  assert.equal(balanced.json('_suggestOrders(loadBudgetData())').reason, 'balanced');
  assert.match(balanced.run('_flowCheckHTML(loadBudgetData())'), /Kein Dauerauftrag nötig/);
  const noSurplus = ctx(doc([item('b2', 'Miete', 'fixe', 'expense', all(900), 'account-4')]));
  assert.equal(noSurplus.json('_suggestOrders(loadBudgetData())').reason, 'no-surplus');
  const partial = ctx(doc([item('b1', 'Gehalt', 'einkommen', 'income', all(1000), 'account-1'), item('b2', 'Miete', 'fixe', 'expense', all(1500), 'account-4')]));
  const p = partial.json('_suggestOrders(loadBudgetData())');
  assert.equal(p.reason, 'partial'); assert.deepEqual(p.orders, [{ from: 'Gehalt Max', to: 'Lastschriften', amount: 1000 }]);
  assert.equal(Math.round(p.missing), 500);
  assert.match(partial.run('_flowCheckHTML(loadBudgetData())'), /Es fehlen trotzdem Ø 500 €/);
  const noAcc = ctx((() => { const d = doc([]); d.accounts = []; return d; })());
  assert.equal(noAcc.json('_suggestOrders(loadBudgetData())').reason, 'no-accounts');
});

test('Daten-Seite: Knopf unter den Daueraufträgen, je nach Stand „prüfen“ oder „ermitteln“', () => {
  const a = ctx(doc(household()));
  assert.match(a.run('_moneyFlowHTML(loadBudgetData())'), /data-flow-check aria-expanded="false">Daueraufträge ermitteln<\/button><\/div><\/details>$/);
  a.run('_flowCheckOpen=true');
  assert.match(a.run('_moneyFlowHTML(loadBudgetData())'), /Prüfung ausblenden<\/button><div class="fc-box">/);
  const b = ctx(doc(household(), [{ id: 'o1', from: { type: 'account', accountId: 'account-1' }, to: { type: 'account', accountId: 'account-4' }, amount: 2800 }]));
  assert.match(b.run('_moneyFlowHTML(loadBudgetData())'), />Daueraufträge prüfen<\/button><\/div><\/details>$/);
});

test('Kredit-Sheet: „Rate abgebucht von“ (eigene Beschriftung, nicht über den lokalen L-Helfer des Sheets)', () => {
  assert.match(html, /\$\{_accountSelectHTML\('loan-account-'\+id,'Rate abgebucht von','',p\.account\|\|'',` data-loan-account="\$\{escHTML\(id\)\}"`\)\}/);
  const en = fs.readFileSync(path.join(__dirname, '..', 'i18n-en.js'), 'utf8');
  assert.match(en, /'Rate abgebucht von': 'Payment debited from'/);
});

// 16.10.2026: Geldfluss in „Daueraufträge prüfen“ – derselbe wie auf der Budget-Seite (Karten und Bänder), mit Status je Karte
const flowFixture = () => doc(household(), [
  { id: 'o1', from: { type: 'account', accountId: 'account-1' }, to: { type: 'account', accountId: 'account-4' }, amount: 2800 },
  { id: 'o2', from: { type: 'account', accountId: 'account-2' }, to: { type: 'account', accountId: 'account-3' }, amount: 500 },
  { id: 'o3', from: { type: 'account', accountId: 'account-2' }, to: { type: 'account', accountId: 'account-5' }, amount: 800 },
  { id: 'o4', from: { type: 'label', name: 'Kindergeld' }, to: { type: 'account', accountId: 'account-3' }, amount: 250 }
]);
test('Geldfluss-Modell wie bisher: Quellkonten links, Zielkonten rechts, Kindergeld beim Ziel', () => {
  const a = ctx(flowFixture());
  const m = a.json('_sankeyModel(loadBudgetData().standingOrders)');
  assert.deepEqual(m.left, [{ label: 'Gehalt Max', val: 2800 }, { label: 'Gehalt Anna', val: 1300 }]);
  assert.deepEqual(m.right, [{ label: 'Lastschriften', val: 2800 }, { label: 'Haushalt', val: 750 }, { label: 'Depot', val: 800 }]);
  assert.equal(m.flows.length, 3);
  assert.equal(a.run('_sankeyModel([])'), null);
});

test('Status je Karte: passt, bleibt, fehlt; ohne zugeordnete Posten kein Status', () => {
  const a = ctx(flowFixture());
  const st = a.json('[..._sankeyStatus(loadBudgetData()).entries()]');
  assert.deepEqual(Object.fromEntries(st), {
    'Gehalt Max': { cls: '', text: 'bleibt +400 €' }, 'Gehalt Anna': { cls: '', text: 'bleibt +500 €' },
    'Haushalt': { cls: '', text: 'bleibt +170 €' }, 'Lastschriften': { cls: 'ok', text: 'passt' }, 'Depot': { cls: 'short', text: 'fehlt 30 €' }
  });
  const none = ctx((() => { const d = flowFixture(); d.budget.items = d.budget.items.map(i => { const x = { ...i }; delete x.accountId; return x; }); return d; })());
  assert.equal(none.run('_sankeyStatus(loadBudgetData()).size'), 0);
});

test('Karten wie bisher, darunter der Status; Bänder je Diagramm (zwei Diagramme gleichzeitig)', () => {
  const a = ctx(flowFixture());
  a.run("globalThis.__c=document.getElementById('sk-test');(()=>{const bd=loadBudgetData(),m=_sankeyModel(bd.standingOrders);renderSankeyDiagram(__c,m.left,m.right,m.flows,m.maxVal,_sankeyStatus(bd),{noFit:true});})()");
  const h = a.el('sk-test').innerHTML;
  assert.match(h, /^<div class="sankey-container-html"><div class="sankey-section-header"><span class="sankey-section-title">Einnahmen<\/span><\/div>/);
  assert.match(h, /<div class="sankey-node-label">Haushalt<\/div>\s*<div class="sankey-node-value">750 €<\/div><div class="sankey-node-status ">bleibt \+170 €<\/div>/);
  assert.match(h, /<div class="sankey-node-label">Lastschriften<\/div>\s*<div class="sankey-node-value">2\.800 €<\/div><div class="sankey-node-status ok">passt<\/div>/);
  // ohne Status (Budget-Seite ohne „Im Budget anzeigen“): unverändert
  a.run("(()=>{const bd=loadBudgetData(),m=_sankeyModel(bd.standingOrders);renderSankeyDiagram(__c,m.left,m.right,m.flows,m.maxVal,null,{noFit:true});})()");
  assert.doesNotMatch(a.el('sk-test').innerHTML, /sankey-node-status/);
  // Bänder und Karten werden im eigenen Container gesucht, Verläufe je Diagramm benannt
  assert.match(html, /const svg=root\.querySelector\('\.sankey-flows-svg'\);/);
  assert.match(html, /const leftCards=root\.querySelectorAll\('\.sankey-left \.sankey-node-card'\);/);
  assert.match(html, /const gradId=`grad-\$\{\(root\.dataset&&root\.dataset\.sankey\)\|\|'b'\}-\$\{fromIdx\}-\$\{toIdx\}`;/);
  assert.match(html, /container\.querySelectorAll\('\.sankey-node-card'\)\.forEach\(card=>\{/);
});

test('Prüfen zeigt den Geldfluss; „Im Budget anzeigen“ ergänzt den Status auf der Budget-Seite', () => {
  const a = ctx(flowFixture());
  a.run("haptic=()=>{};_toast=()=>{};renderBudgetPage=()=>{};document.getElementById('sankeyWrap').insertAdjacentHTML=function(p,x){this.innerHTML+=x;}");
  let h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /<div class="sankey-wrap fc-sankey" data-sankey="check"><\/div><button type="button" class="btn btn-ghost v2-wide fc-budget" data-flow-budget aria-pressed="false">Im Budget anzeigen<\/button>/);
  assert.equal(a.run('_sankeyPending.check.model.left.length'), 2);
  // Budget-Seite ohne Wahl: bisheriger Geldfluss ohne Status
  a.run('renderBudgetSankey({einnahmen:5000})');
  assert.match(a.el('sankeyWrap').innerHTML, /sankey-container-html/);
  assert.doesNotMatch(a.el('sankeyWrap').innerHTML, /sankey-node-status|fd-cap/);
  a.run("_uiSetOpen('budgetflow',true)");
  assert.equal(a.json('appStorage.document()').preferences.expandedSections.budgetflow, true, 'im Dokument gespeichert (Sicherung)');
  a.run('renderBudgetSankey({einnahmen:5000})');
  assert.match(a.el('sankeyWrap').innerHTML, /<div class="sankey-node-status short">fehlt 30 €<\/div>/);
  assert.match(a.el('sankeyWrap').innerHTML, /<p class="fd-cap">Ø je Monat über die zwölf Planmonate · <button[^>]*>Daueraufträge prüfen<\/button><\/p>$/);
  h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /aria-pressed="true">Im Budget angezeigt · entfernen<\/button>/);
  // Vorschlag (ohne Daueraufträge): Geldfluss mit den vorgeschlagenen Aufträgen, dann fehlt nichts
  const b = ctx(doc(household()));
  assert.match(b.run('_flowCheckHTML(loadBudgetData())'), /Vorschlag aus den zugeordneten.*<div class="sankey-wrap fc-sankey" data-sankey="check">/);
  assert.deepEqual(b.json('_sankeyPending.check.model.right.map(n=>n.label)'), ['Haushalt', 'Depot', 'Lastschriften']);
  assert.ok(b.json('[..._sankeyPending.check.status.values()]').every(x => x.cls !== 'short'));
});

// 16.10.2026: Schalter „Nur feste monatliche Einnahmen“ (Standard an) für Prüfung und Vorschlag
test('Nur feste monatliche Einnahmen: Weihnachtsgeld und Jahresbonus zählen nicht; Schalter aus = alle im Durchschnitt', () => {
  const salary = all(3000); salary[10] = 6000;
  const bonus = Array(12).fill(0); bonus[2] = 1200;
  const a = ctx(doc([
    item('b1', 'Gehalt', 'einkommen', 'income', salary, 'account-1'),
    item('b2', 'Bonus', 'einkommen', 'income', bonus, 'account-1'),
    item('b3', 'Miete', 'fixe', 'expense', all(1000), 'account-4')
  ]));
  a.run("haptic=()=>{};_toast=()=>{};renderBudgetPage=()=>{}");
  assert.equal(a.run('_flowFixedIncome()'), true, 'Standard: nur feste');
  let f = a.json('(()=>{const f=_accountFlows(loadBudgetData(),false);f.list.forEach(x=>delete x.inLabels);return f;})()');
  assert.equal(Math.round(f.list.find(x => x.name === 'Gehalt Max').inItems), 3000);
  assert.deepEqual(f.variable.map(([l, v]) => [l, Math.round(v)]), [['Gehalt', 250], ['Bonus', 100]]);
  // Vorschlag: aus 3.000 € fester Einnahme, nicht aus 3.350 € Durchschnitt
  assert.deepEqual(a.json('_suggestOrders(loadBudgetData()).orders'), [{ from: 'Gehalt Max', to: 'Lastschriften', amount: 1000 }]);
  let h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /^<div class="fc-box"><div class="ds-group"><div class="ds-row fc-switch" data-flow-fixed[^>]*><span class="ds-l">Nur feste monatliche Einnahmen<small>Daueraufträge laufen jeden Monat gleich[^<]*<\/small><\/span><span class="v2-switch" role="switch" tabindex="0" aria-checked="true"/);
  assert.match(h, /Nicht berücksichtigt, weil nicht jeden Monat gleich: Ø 350 € im Monat \(Gehalt, Bonus\)/);
  // Schalter aus: alle Einnahmen im Durchschnitt
  a.run('_dataClick({target:{closest:s=>s===\'[data-flow-fixed]\'?{}:null}})');
  assert.equal(a.run('_flowFixedIncome()'), false);
  assert.equal(a.json('appStorage.document()').preferences.expandedSections.flowallincome, true, 'im Dokument gespeichert');
  f = a.json('(()=>{const f=_accountFlows(loadBudgetData(),false);f.list.forEach(x=>delete x.inLabels);return f;})()');
  assert.equal(Math.round(f.list.find(x => x.name === 'Gehalt Max').inItems), 3350);
  assert.deepEqual(f.variable, []);
  h = a.run('_flowCheckHTML(loadBudgetData())');
  assert.match(h, /aria-checked="false"/); assert.match(h, /Alle Einnahmen im Durchschnitt über das Jahr/);
  assert.doesNotMatch(h, /Nicht berücksichtigt/);
});
