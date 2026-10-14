/* Datensicherheit nach dem unabhängigen Review vom 14.10.2026 (.docs/REVIEW_2026-10.md, P34–P37).
   Vorhandene Daten dürfen weder still überschrieben noch bei einer Migration fachlich verändert werden.
   Erwartungen aus den Anforderungen und aus Geldfluss-Rechnungen, nicht aus der Implementierung. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../data-store.js');
const { MemoryStorage } = require('./app-harness.cjs');
const { fixture, context, simulate, near } = require('./forecast-fixture.cjs');

const clone = x => JSON.parse(JSON.stringify(x));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Testbrowser: ein gemeinsamer Speicher mit storage-Ereignissen und Web Locks wie in Chrome/Safari ──
   Jedes Fenster bekommt eine Sicht auf denselben Speicher; schreibt ein Fenster, erhalten die anderen ein Ereignis.
   Die Sperren sind exklusiv, ifAvailable liefert null, wartende Anfragen werden der Reihe nach vergeben und beim
   Schließen eines Fensters freigegeben. */
function browser(seed = {}) {
  const shared = new MemoryStorage(seed), windows = new Set();
  const held = new Map(), queue = new Map();
  const grant = name => {
    if (held.has(name)) return;
    const q = queue.get(name) || [];
    while (q.length && q[0].win.closed) q.shift();
    if (q.length) run(name, q.shift());
  };
  const run = (name, req) => {
    held.set(name, req);
    let result;
    try { result = Promise.resolve(req.cb({ name, mode: 'exclusive' })); } catch (e) { result = Promise.reject(e); }
    req.finish = v => { if (held.get(name) === req) { held.delete(name); grant(name); } req.resolve(v); };
    result.then(req.finish, req.finish);
  };
  function open() {
    const win = { closed: false, listeners: [] };
    const storage = {
      get length() { return shared.length; },
      key: i => shared.key(i),
      getItem: k => shared.getItem(k),
      setItem(k, v) { shared.setItem(k, v); for (const w of windows) if (w !== win && !w.closed) w.listeners.forEach(f => f(k)); },
      removeItem(k) { shared.removeItem(k); for (const w of windows) if (w !== win && !w.closed) w.listeners.forEach(f => f(k)); }
    };
    const locks = {
      request(name, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        return new Promise(resolve => {
          const req = { cb, resolve, win };
          if (opts.ifAvailable && held.has(name)) { Promise.resolve(cb(null)).then(resolve); return; }
          if (!held.has(name)) run(name, req); else (queue.get(name) || queue.set(name, []).get(name)).push(req);
        });
      }
    };
    win.storage = storage; win.locks = locks;
    win.listen = f => win.listeners.push(f);
    /* Fenster schließen oder abstürzen: der Browser gibt seine Sperren frei, ohne dass Code läuft */
    win.close = () => { win.closed = true; for (const [name, req] of [...held]) if (req.win === win) req.finish(); };
    windows.add(win);
    return win;
  }
  return { shared, open };
}
const timing = { poll: 5, handover: 150, request: 400 };
async function windowStore(b, busy = () => false) {
  const w = b.open();
  const store = Data.createStore(w.storage, { locks: w.locks, isBusy: busy, timing });
  w.listen(k => store.onStorage(k));
  await store.ready();
  return { w, store };
}
const settings = st => JSON.parse(st.getItem(Data.KEY)).forecast.settings;

/* ── P34: Vergleich und Schreiben zwischen Fenstern ── */
test('P34: kontrollierte Schreibverschachtelung – eine gespeicherte Änderung geht nie verloren', async () => {
  const b = browser({ 'lt-inflation': '2', 'lt-safety': '85', 'lt-birth-year': '1985' });
  const A = await windowStore(b), B = await windowStore(b);
  assert.equal(A.store.canWrite(), true, 'das zuerst geöffnete Fenster schreibt');
  assert.equal(B.store.canWrite(), false, 'das zweite Fenster liest nur');
  // Reproduktion aus dem Review: A schreibt genau zwischen der Prüfung und dem Schreiben von B
  const write = b.shared.setItem.bind(b.shared); let once = true;
  b.shared.setItem = (k, v) => { if (once && k === Data.KEY) { once = false; A.store.setItem('lt-inflation', '3'); } write(k, v); };
  assert.throws(() => B.store.setItem('lt-safety', '90'), e => e.code === 'READ_ONLY' && /anderen Fenster/.test(e.message));
  A.store.setItem('lt-inflation', '3');
  b.shared.setItem = write;
  assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [3, 85], 'Änderung aus A bleibt, B wurde sichtbar abgelehnt');
  // B übernimmt die Bearbeitung: A gibt ab, B lädt den Stand von A und speichert darauf
  assert.equal(await B.store.requestWrite(), 'writer');
  assert.equal(A.store.canWrite(), false);
  assert.equal(B.store.getItem('lt-inflation'), '3', 'B rechnet mit dem Stand von A');
  B.store.setItem('lt-safety', '90');
  assert.throws(() => A.store.setItem('lt-inflation', '4'), e => e.code === 'READ_ONLY');
  assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [3, 90]);
});
test('P34: solange im schreibenden Fenster bearbeitet wird, gibt es nicht ab', async () => {
  const b = browser({ 'lt-inflation': '2' });
  let busy = true;
  const A = await windowStore(b, () => busy), B = await windowStore(b);
  assert.equal(await B.store.requestWrite(), 'busy');
  assert.equal(A.store.canWrite(), true); assert.equal(B.store.canWrite(), false);
  busy = false;
  assert.equal(await B.store.requestWrite(), 'writer');
});
test('P34: schließt oder stürzt das schreibende Fenster ab, übernimmt ein anderes mit dessen letztem Stand', async () => {
  const b = browser({ 'lt-inflation': '2' });
  const A = await windowStore(b), B = await windowStore(b);
  A.store.setItem('lt-inflation', '6');
  A.w.close(); // ohne Abmeldung (Absturz)
  for (let i = 0; i < 100 && !B.store.canWrite(); i++) await sleep(5);
  assert.equal(B.store.canWrite(), true);
  assert.equal(B.store.getItem('lt-inflation'), '6');
  B.store.setItem('lt-safety', '91');
  assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [6, 91]);
});
test('P34: alle Schreibwege (Transaktion, Import, Zurücksetzen, Umbenennen) sind im lesenden Fenster gesperrt', async () => {
  const b = browser({ 'lt-inflation': '2' });
  await windowStore(b); const B = await windowStore(b);
  const raw = b.shared.getItem(Data.KEY), doc = B.store.document();
  doc.forecast.settings.inflationPercent = 7;
  B.store.beginTransaction(); B.store.setItem('lt-inflation', '9');
  assert.throws(() => B.store.commitTransaction(), e => e.code === 'READ_ONLY');
  assert.throws(() => B.store.importBackup(doc), e => e.code === 'READ_ONLY');
  assert.throws(() => B.store.clear(), e => e.code === 'READ_ONLY');
  assert.equal(b.shared.getItem(Data.KEY), raw);
  // ohne Änderung schreibt auch ein lesendes Fenster nichts und meldet keinen Fehler
  B.store.removeItem('lt-pension-age');
});

/* ── P35: Gehaltsmigration aus Schema 13 ── */
function v13(people, items) {
  const d = Data.empty(); d.schemaVersion = 13;
  d.retirement.primary.birthYear = 1985;
  d.retirement.people = people.map((p, i) => ({ id: 'p' + (i + 1), name: p.name, birthYear: 1987, statutoryPension: {}, ...p }));
  d.budget = { items: items.map((x, i) => ({ id: 'b' + i, name: x[0], category: 'einkommen', subcategory: '', kind: 'income', targetGroupId: null, monthlyAmounts: Array(12).fill(x[1]) })), standingOrders: [] };
  return d;
}
const incomeSum = doc => doc.budget.items.filter(i => i.kind === 'income').reduce((a, i) => a + i.monthlyAmounts[0], 0);
test('P35: vorhandenes Gehalt mit allgemeinem Namen wird nicht verdoppelt; der alte Betrag bleibt erhalten', () => {
  for (const items of [[['Gehalt Partnerin', 1800]], [['Gehalt', 1800]], [['Gehalt 1', 1800], ['Gehalt 2', 1800]], [['Nettogehalt Anna', 1700]], []]) {
    const old = v13([{ name: 'Anna', monthlyNetIncome: 1800 }], items);
    const doc = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(old) })).document();
    assert.equal(incomeSum(doc), incomeSum(old), 'Budget-Einnahmen unverändert: ' + JSON.stringify(items));
    assert.deepEqual(doc.budget.items, old.budget.items, 'vorhandene Budgetposten unverändert');
    assert.equal(doc.retirement.people[0].monthlyNetIncome, 1800, 'der alte Betrag bleibt bis zur Zuordnung erhalten');
  }
});
test('P35: eindeutig gleicher Posten (Name und Betrag) wird zugeordnet, ohne Einnahmen zu ändern', () => {
  const old = v13([{ name: 'Anna', monthlyNetIncome: 1800 }], [['Nettogehalt Anna', 1800], ['Miete', 300]]);
  const doc = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(old) })).document();
  assert.equal(doc.budget.items[0].personId, 'p1');
  assert.equal(doc.retirement.people[0].monthlyNetIncome, undefined);
  assert.equal(incomeSum(doc), 2100);
});
test('P35: bis zur Zuordnung rechnet die Prognose mit dem alten Gehalt; die Zuordnung zeigt vorher und nachher', () => {
  const old = v13([{ name: 'Anna', monthlyNetIncome: 1800 }], [['Gehalt Partnerin', 1800], ['Gehalt Max', 3200]]);
  const m = Data.migrate(clone(old)); m.schemaVersion = Data.VERSION;
  const a = context(m);
  assert.equal(a.json("_personSalary('p1')"), 1800, 'wie in Schema 13: Annas Gehalt 1.800 €');
  const tasks = a.json('_migrationTasks()');
  assert.equal(tasks.length, 1); assert.equal(tasks[0].kind, 'net');
  const pv = a.json("_netIncomePreview('p1','b0')");
  assert.deepEqual([pv.incomeBefore, pv.incomeAfter, pv.salaryBefore, pv.salaryAfter], [5000, 5000, 1800, 1800]);
  const pn = a.json("_netIncomePreview('p1','new')");
  assert.deepEqual([pn.incomeBefore, pn.incomeAfter], [5000, 6800], 'ein neuer Posten erhöht die Einnahmen sichtbar');
  a.run("_assignNetIncome('p1','b0')");
  const doc = a.json('appStorage.document()');
  assert.equal(doc.budget.items.find(i => i.id === 'b0').personId, 'p1');
  assert.equal(doc.retirement.people[0].monthlyNetIncome, undefined);
  assert.equal(incomeSum(doc), 5000);
  assert.equal(a.json("_personSalary('p1')"), 1800);
  assert.equal(a.json('_migrationTasks().length'), 0);
});
test('P35: Migration ist wiederholbar und übersteht Export und Import unverändert', () => {
  const old = v13([{ name: 'Anna', monthlyNetIncome: 1800 }], [['Gehalt', 1800]]);
  const s = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(old) }));
  const once = s.document(), twice = Data.migrate(clone(once));
  assert.deepEqual(twice, once);
  const r = Data.createStore(new MemoryStorage()); r.importBackup(s.exportBackup());
  assert.deepEqual(r.document(), once);
});

/* ── P36: Teilzeit aus Schema 14 ── */
function v14(person, settings = {}) {
  const d = fixture(undefined, settings); d.schemaVersion = 14;
  d.retirement.people = [{ id: 'p1', name: 'Anna', birthYear: 1985, workUntilAge: 67, statutoryPension: {}, ...person }];
  return d;
}
test('P36: der genaue Teilzeitbeginn bleibt bei der Migration erhalten', () => {
  const d = v14({ partTimeFromAge: 48, partTimePercent: 50 }, { saveUntilAge: 50, retirementAge: 60, pensionStartAge: 67 });
  const p = Data.migrate(clone(d), new Date('2026-10-08')).retirement.people[0];
  assert.deepEqual([p.partTimeFromAge, p.partTimePercent], [48, 50]);
  assert.ok(!Object.keys(p).some(k => /^phase\dWorkPercent$/.test(k)), 'keine ungefragte Umstellung auf Phasen');
  const doc = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(d) })).document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.equal(doc.retirement.people[0].partTimeFromAge, 48);
});
test('P36: Teilzeitbeginn innerhalb einer Phase wirkt weiter ab genau diesem Monat', () => {
  // Ab heute Vorruhestand (Phase 3 bis 50), Bedarf 1.000 €; Anna (gleich alt) verdient 600 €, ab 43 halb, bis 44.
  // Je Monat: bis 43 fehlen 400 €, danach 700 € (nicht schon ab Beginn der Phase).
  const d = v14({ partTimeFromAge: 43, partTimePercent: 50, workUntilAge: 44 }, { monthlySpending: 1000, pensionSpending: 1000, pensionStartAge: 50 });
  d.snapshots[0].positions[0].value = 20000;
  const m = Data.migrate(d, new Date('2026-10-08')); m.schemaVersion = Data.VERSION;
  const a = context(m);
  a.context.fxValue = JSON.stringify({ einkommen: [{ id: 'b1', name: 'Gehalt Anna', subcat: '', kind: 'income', person: 'p1', targetGroupId: null, values: Array(12).fill(600) }], fixe: [], variable: [], sparen: [], accounts: {}, standingOrders: [] });
  a.run("appStorage.setItem('budgetData',fxValue)");
  const r = simulate(a);
  near(assert, r.total[1], 20000 - 15 * 400, 1e-6, 'bis 43 volles Gehalt');
  near(assert, r.total[2], 20000 - 15 * 400 - 12 * 700, 1e-6, 'ab 43 halbes Gehalt');
  assert.match(a.json("_personPhaseText(getLifetimeSettings(),getDrvExtra()[0])"), /Teilzeit 50 % ab 43/);
});
test('P36: Umstellung auf Lebensphasen erst nach ausdrücklicher Entscheidung, mit Vorher/Nachher', () => {
  const d = v14({ partTimeFromAge: 48, partTimePercent: 50 }, { saveUntilAge: 50, retirementAge: 60, pensionStartAge: 67 });
  const m = Data.migrate(d, new Date('2026-10-08')); m.schemaVersion = Data.VERSION;
  const a = context(m);
  a.context.fxValue = JSON.stringify({ einkommen: [{ id: 'b1', name: 'Gehalt Anna', subcat: '', kind: 'income', person: 'p1', targetGroupId: null, values: Array(12).fill(600) }], fixe: [], variable: [], sparen: [], accounts: {}, standingOrders: [] });
  a.run("appStorage.setItem('budgetData',fxValue)");
  const pv = a.json("_partTimePreview('p1',2)");
  assert.deepEqual([pv.fromBefore, pv.fromAfter], [48, 50], 'Phase 2 beginnt mit 50: zwei Jahre später');
  assert.equal(pv.incomeDelta, 24 * 300, '24 Monate × 300 € mehr Gehalt');
  const before = a.storage.getItem(Data.KEY);
  assert.equal(a.json('getDrvExtra()[0].ptFrom'), 48, 'ohne Entscheidung bleibt alles');
  assert.equal(a.storage.getItem(Data.KEY), before);
  a.run("_convertPartTime('p1',2)");
  const p = a.json('appStorage.document()').retirement.people[0];
  assert.deepEqual([p.partTimeFromAge, p.phase2WorkPercent], [undefined, 50]);
});
test('P36: Teilzeit ab Alter und Arbeitszeit je Phase schließen sich aus', () => {
  const s = Data.createStore(new MemoryStorage({ 'lt-birth-year': '1985', 'lt-drv-extra': JSON.stringify([{ id: 'p1', name: 'Anna', by: 1987, until: 67, ptFrom: 60, ptPct: 50 }]) }));
  assert.equal(s.document().retirement.people[0].partTimeFromAge, 60);
  const bad = s.exportBackup(); bad.retirement.people[0].phase2WorkPercent = 80;
  assert.throws(() => s.importBackup(bad));
  for (const row of [{ ptFrom: 60 }, { ptFrom: 60, ptPct: 100 }, { ptFrom: 70, ptPct: 50 }]) {
    assert.throws(() => s.setItem('lt-drv-extra', JSON.stringify([{ id: 'p1', name: 'Anna', by: 1987, until: 67, ...row }])), JSON.stringify(row));
  }
  assert.equal(s.document().retirement.people[0].partTimeFromAge, 60, 'ungültige Eingaben ändern nichts');
});

/* ── P37: Kinderjahrgänge an Depots aus Schema ≤ 13 ── */
function v12(years) {
  const d = fixture(undefined, { saveUntilAge: 60, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90 }); d.schemaVersion = 12;
  d.retirement.pensionDepots = [{ id: 'd1', name: 'Depot', personId: d.retirement.primary.id, monthlyContribution: 150, childBirthYears: years }];
  return d;
}
test('P37: ein früher gültiger Kinderjahrgang blockiert das Laden nicht; das Original bleibt erhalten', () => {
  const old = v12([2019.5]), raw = JSON.stringify(old);
  Data.validate(old);
  const st = new MemoryStorage({ [Data.KEY]: raw });
  const s = Data.createStore(st);
  const doc = s.document();
  assert.equal(doc.retirement.children, undefined, 'kein Kind mit erfundenem Jahr');
  assert.deepEqual(doc.retirement.pensionDepots[0].unresolvedChildBirthYears, [2019.5], 'Originalwert bleibt zur Klärung');
  assert.equal(st.getItem(Data.KEY), raw, 'Laden schreibt nichts');
  // beim ersten Speichern wird zuerst das unveränderte Original gesichert
  s.setItem('lt-inflation', '3');
  assert.equal(st.getItem(Data.BACKUP_KEY), raw);
  assert.equal(JSON.parse(st.getItem(Data.KEY)).schemaVersion, Data.VERSION);
  assert.equal(s.backupBeforeUpdate().raw, raw, 'Original exportierbar');
  // wiederholtes Laden: unverändert, Sicherung bleibt das Original
  const again = Data.createStore(st);
  assert.deepEqual(again.document().retirement.pensionDepots[0].unresolvedChildBirthYears, [2019.5]);
  again.setItem('lt-inflation', '4');
  assert.equal(st.getItem(Data.BACKUP_KEY), raw);
});
test('P37: gültige Jahrgänge werden Kinder, ungültige (auch außerhalb 1900–2200) warten auf Klärung', () => {
  const doc = Data.migrate(clone(v12([2019, 2019.5, 1850, 2300])));
  assert.deepEqual(doc.retirement.children.map(c => c.birthYear), [2019]);
  assert.deepEqual(doc.retirement.pensionDepots[0].unresolvedChildBirthYears, [2019.5, 1850, 2300]);
  doc.schemaVersion = Data.VERSION; Data.validate(doc);
});
test('P37: bis zur Klärung rechnet die Kinderzulage wie die frühere Version; Klärung erst auf Nachfrage', () => {
  // Die frühere Version las „2019.5“ als Jahrgang 2019: Kinderzulage bis zum Jahr des 18. Geburtstags (2037)
  const migrated = () => { const m = Data.migrate(v12([2019.5])); m.schemaVersion = Data.VERSION; return m; };
  const a = context(migrated());
  assert.deepEqual([a.json('avdYear(getLifetimeSettings(),getAvDepots()[0],2027).kids'), a.json('avdYear(getLifetimeSettings(),getAvDepots()[0],2038).kids')], [1, 0]);
  const tasks = a.json('_migrationTasks()');
  assert.deepEqual(tasks.map(t => [t.kind, t.value]), [['kid', 2019.5]]);
  const before = a.storage.getItem(Data.KEY);
  assert.throws(() => a.run("_resolveChildYear('d1',2019.5,2020.5)"), 'kein ganzes Geburtsjahr: abgelehnt, nicht gerundet');
  assert.equal(a.storage.getItem(Data.KEY), before);
  a.run("_resolveChildYear('d1',2019.5,2020)");
  const doc = a.json('appStorage.document()');
  assert.deepEqual(doc.retirement.children.map(c => c.birthYear), [2020]);
  assert.equal(doc.retirement.pensionDepots[0].unresolvedChildBirthYears, undefined);
  const b = context(migrated());
  b.run("_resolveChildYear('d1',2019.5,null)");
  assert.equal(b.json('appStorage.document()').retirement.children, undefined, 'verworfen: kein Kind');
});
test('P37: ein ungültig migrierter Stand wird nie gespeichert', () => {
  const st = new MemoryStorage({ [Data.KEY]: JSON.stringify(v12([2019.5])) });
  const s = Data.createStore(st), raw = st.getItem(Data.KEY);
  const bad = s.document(); bad.retirement.pensionDepots[0].unresolvedChildBirthYears = ['x'];
  assert.throws(() => s.importBackup(bad));
  assert.equal(st.getItem(Data.KEY), raw);
});
/* Erwartung geändert durch das Folge-Review (P55, Empfehlung 2): Lehnt der Browser die Sperre ab, schrieb das Fenster
   früher automatisch ungesichert (nur P1). Jetzt bleibt es im Lesemodus und schreibt erst nach ausdrücklicher Entscheidung. */
test('P34/P55: lehnt der Browser die Sperre ab, bleibt das Fenster im Lesemodus, bis man ausdrücklich nur hier bearbeitet', async () => {
  const st = new MemoryStorage({ 'lt-inflation': '2' });
  const s = Data.createStore(st, { locks: { request: () => Promise.reject(Object.assign(new Error('denied'), { name: 'SecurityError' })) } });
  assert.equal(await s.ready(), 'unsupported');
  assert.throws(() => s.setItem('lt-inflation', '3'), e => e.code === 'READ_ONLY');
  assert.equal(st.getItem(Data.KEY), null);
  assert.equal(s.allowSingle(), 'single');
  s.setItem('lt-inflation', '3');
  assert.equal(JSON.parse(st.getItem(Data.KEY)).forecast.settings.inflationPercent, 3);
});
