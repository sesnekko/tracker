/* Schreibrecht, Entwürfe und Lebenszyklus nach dem Folge-Review vom 14.10.2026 (.docs/REVIEW_2026-10_FOLGE.md, P54, P55,
   P63). Erwartungen aus den Anforderungen, nicht aus der Implementierung.
   Der Testbrowser liefert storage-Ereignisse und Sperren wie Chrome und Safari asynchron (jedes Ereignis, jeder
   Sperr-Rückruf in einer eigenen Aufgabe, Reihenfolge erhalten). Eine Seite im bfcache bekommt keine storage-Ereignisse,
   und sie werden nach der Rückkehr nicht nachgeliefert. Nach jedem Ereignis prüft er, dass höchstens ein Fenster schreiben
   darf und dass es die Sperre wirklich hält. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
const { fixture } = require('./forecast-fixture.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const LOCK = 'vermoegen-writer';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(ok, ms = 2000) { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) return false; await sleep(2); } return true; }
/* Ein Versprechen, das nie endet, lässt den Test scheitern statt hängen */
const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ' endet nicht innerhalb von ' + ms + ' ms'); })]);
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const settings = st => JSON.parse(st.getItem(Data.KEY)).forecast.settings;
/* keine unbehandelten Ablehnungen während des Tests */
async function noUnhandled(fn) {
  const seen = [], catcher = e => seen.push(e && e.message || String(e));
  process.on('unhandledRejection', catcher);
  try { await fn(); await sleep(20); } finally { process.removeListener('unhandledRejection', catcher); }
  assert.deepEqual(seen, [], 'unbehandelte Ablehnungen');
}

function browser(seed = {}) {
  const shared = new MemoryStorage(seed), windows = new Set(), held = new Map(), queue = new Map();
  const b = { shared, hooks: {}, violations: [] };
  b.writers = () => [...windows].filter(w => !w.closed && w.canWrite && w.canWrite());
  const check = () => {
    const ws = b.writers();
    if (ws.length > 1) b.violations.push('zwei Writer');
    ws.forEach(w => { const h = held.get(LOCK); if (!h || h.win !== w) b.violations.push('Writer ohne Sperre'); });
  };
  const later = f => setTimeout(() => { f(); check(); }, 0);
  const release = (name, req) => { if (held.get(name) === req) { held.delete(name); later(() => grantNext(name)); } };
  const grantNext = name => {
    if (held.has(name)) return;
    const q = queue.get(name) || [];
    while (q.length && q[0].win.closed) q.shift();
    if (q.length) run(name, q.shift());
  };
  const run = (name, req) => {
    held.set(name, req);
    later(() => {
      if (req.win.closed) { release(name, req); return; }
      let result;
      try { result = Promise.resolve(req.cb({ name, mode: 'exclusive' })); } catch (e) { result = Promise.reject(e); }
      result.then(v => { release(name, req); req.resolve(v); }, e => { release(name, req); req.reject(e); });
    });
  };
  const notify = (from, k) => {
    for (const w of windows) if (w !== from && !w.closed && !w.cached) later(() => { if (!w.closed && !w.cached) w.listeners.forEach(f => f(k)); });
  };
  b.held = (name = LOCK) => held.has(name) ? held.get(name).win : null;
  b.queued = (win, name = LOCK) => (queue.get(name) || []).filter(r => !win || r.win === win).length;
  b.open = () => {
    const win = { closed: false, cached: false, listeners: [] };
    win.storage = {
      get length() { return shared.length; }, key: i => shared.key(i), getItem: k => shared.getItem(k),
      setItem(k, v) { shared.setItem(k, v); notify(win, k); },
      removeItem(k) { shared.removeItem(k); notify(win, k); }
    };
    win.locks = {
      request(name, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        return new Promise((resolve, reject) => {
          const hook = b.hooks.request && b.hooks.request(win, name, opts);
          if (hook === 'silent') return;
          if (hook === 'reject') { later(() => reject(Object.assign(new Error('queued request denied'), { name: 'SecurityError' }))); return; }
          const req = { cb, resolve, reject, win };
          if (opts.ifAvailable && (held.has(name) || b.queued(null, name))) { later(() => Promise.resolve().then(() => cb(null)).then(resolve, reject)); return; }
          if (opts.signal) {
            if (opts.signal.aborted) { later(() => reject(abortError())); return; }
            opts.signal.addEventListener('abort', () => {
              const q = queue.get(name) || [], i = q.indexOf(req);
              if (i >= 0) { q.splice(i, 1); later(() => reject(abortError())); }
            });
          }
          if (!held.has(name) && !b.queued(null, name)) run(name, req);
          else (queue.get(name) || queue.set(name, []).get(name)).push(req);
        });
      }
    };
    win.listen = f => win.listeners.push(f);
    /* Schließen oder Absturz: der Browser gibt die Sperren frei und verwirft wartende Anfragen, ohne dass Code läuft */
    win.close = () => {
      win.closed = true;
      for (const [name, req] of [...held]) if (req.win === win) release(name, req);
      for (const q of queue.values()) for (let i = q.length - 1; i >= 0; i--) if (q[i].win === win) q.splice(i, 1);
    };
    windows.add(win);
    return win;
  };
  return b;
}
const timing = { poll: 2, handover: 150, request: 400, start: 300 };
function windowStore(b, opts = {}) {
  const w = b.open();
  if (opts.locks) w.locks = opts.locks(w.locks);
  w.store = Data.createStore(w.storage, { locks: w.locks, requireLocks: true, isBusy: opts.busy || (() => false), timing: { ...timing, ...(opts.timing || {}) } });
  w.listen(k => w.store.onStorage(k));
  w.canWrite = () => w.store.canWrite();
  return w;
}
function doc(settingsPatch = {}) {
  const d = fixture([{ id: 'konto', group: 'Cash', cat: 'cash', value: 1000 }],
    { saveUntilAge: 55, retirementAge: 62, pensionStartAge: 67, planningHorizonAge: 90, monthlySpending: 3200, ...settingsPatch });
  return { [Data.KEY]: JSON.stringify(d) };
}

/* ── P54: Entwürfe behalten ihre Basis ── */
test('P54: ein Entwurf behält seine Basis – nach der Übernahme des Schreibrechts überschreibt er den neueren Stand nicht', async () => {
  const b = browser(doc());
  const A = windowStore(b); assert.equal(await A.store.ready(), 'writer');
  const B = windowStore(b); assert.equal(await B.store.ready(), 'reader');
  // B öffnet einen Entwurf mit Bedarf 3.200 (Basis = Stand beim Öffnen)
  const base = B.store.revision(), draft = B.store.getItem('lt-monthly-withdraw');
  assert.equal(draft, '3200');
  // A speichert 4.000 und schließt sein Fenster
  A.store.setItem('lt-monthly-withdraw', '4000');
  A.store.suspend(); A.close();
  assert.ok(await until(() => B.store.canWrite()), 'B übernimmt');
  assert.equal(B.store.getItem('lt-monthly-withdraw'), '4000', 'B hat den Stand von A geladen');
  assert.ok(B.store.revision() > base, 'die Übernahme ist ein neuer Stand – die Basis des Entwurfs bleibt die alte');
  // B speichert den alten Entwurf: abgelehnt, nichts geschrieben
  assert.throws(() => B.store.withBase(base, () => B.store.setItem('lt-monthly-withdraw', draft)), e => e.code === 'STALE' && /Eingaben sind noch da/.test(e.message));
  assert.equal(settings(b.shared).monthlySpending, 4000, 'kein stiller Rückfall auf 3.200');
  // nachvollziehbarer Abgleich: erst ausdrücklich auf der neuen Basis gespeichert
  B.store.withBase(B.store.revision(), () => B.store.setItem('lt-monthly-withdraw', '3500'));
  assert.equal(settings(b.shared).monthlySpending, 3500);
  assert.deepEqual(b.violations, []);
});
test('P54: eine Transaktion, die vor einem übernommenen Stand begann, wird abgelehnt und schreibt nichts', async () => {
  const b = browser(doc());
  const A = windowStore(b); await A.store.ready();
  const B = windowStore(b); await B.store.ready();
  B.store.beginTransaction(); B.store.setItem('lt-monthly-withdraw', '3300');
  A.store.setItem('lt-inflation', '3');
  A.store.suspend(); A.close();
  assert.ok(await until(() => B.store.canWrite()));
  assert.throws(() => B.store.commitTransaction(), e => e.code === 'STALE');
  assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).monthlySpending], [3, 3200]);
  B.store.beginTransaction(); B.store.rollbackTransaction();/* keine Transaktion mehr offen */
});
test('P54: ohne eigene Basis gilt mit trackView der zuletzt angezeigte Stand', () => {
  const st = new MemoryStorage(doc()), A = Data.createStore(st, { trackView: true }), B = Data.createStore(st);
  A.markShown();
  B.setItem('lt-inflation', '4');
  assert.equal(A.reload(), true);
  assert.throws(() => A.setItem('lt-safety', '90'), e => e.code === 'STALE', 'noch nicht angezeigt');
  A.markShown();
  A.setItem('lt-safety', '90');
  assert.deepEqual([settings(st).inflationPercent, settings(st).safetyPercent], [4, 90]);
});

/* ── P55: jeder Fehlerpfad endet bestimmt und lässt sich wiederholen ── */
test('P55: Speicher voll bei der Erstübernahme – Sperre frei, Original erhalten, erneuter Versuch gelingt', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    b.shared.failWrites = true;
    const A = windowStore(b);
    const t0 = Date.now();
    assert.equal(await within(A.store.ready(), 1000, 'ready()'), 'failed');
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(A.store.canWrite(), false);
    assert.ok(await until(() => b.held() === null), 'keine zurückbleibende Lock-Haltung');
    assert.equal(b.shared.getItem('lt-inflation'), '2', 'Original unverändert');
    assert.equal(b.shared.getItem(Data.KEY), null);
    assert.match(String(A.store.writerFailure().message), /Quota/);
    assert.throws(() => A.store.setItem('lt-inflation', '3'), e => e.code === 'READ_ONLY');
    // Ursache beseitigt: „Erneut versuchen“
    b.shared.failWrites = false;
    assert.equal(await within(A.store.requestWrite(), 1000, 'requestWrite()'), 'writer');
    assert.equal(b.shared.getItem('lt-inflation'), null, 'alte Schlüssel erst nach dem erfolgreichen Schreiben entfernt');
    assert.equal(settings(b.shared).inflationPercent, 2);
    A.store.setItem('lt-inflation', '3');
    assert.equal(settings(b.shared).inflationPercent, 3);
    assert.deepEqual(b.violations, []);
  });
});
test('P55: scheitert die Übernahme weiterhin, meldet „Erneut versuchen“ das und bleibt bedienbar', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    b.shared.failWrites = true;
    const A = windowStore(b);
    assert.equal(await A.store.ready(), 'failed');
    assert.equal(await within(A.store.requestWrite(), 1000, 'requestWrite()'), 'failed');
    assert.ok(await until(() => b.held() === null));
    b.shared.failWrites = false;
    assert.equal(await A.store.requestWrite(), 'writer');
  });
});
test('P55: eine abgelehnte eingereihte Sperranfrage endet ohne unbehandelte Ablehnung; „Hier bearbeiten“ stellt neu an', async () => {
  await noUnhandled(async () => {
    const b = browser(doc());
    const A = windowStore(b); await A.store.ready();
    let deny = true, B = null;
    b.hooks.request = (win, name, opts) => B && win === B && !opts.ifAvailable && deny ? 'reject' : undefined;
    B = windowStore(b);
    assert.equal(await B.store.ready(), 'reader');
    assert.ok(await until(() => !!B.store.writerFailure()), 'die Ablehnung wird festgehalten');
    assert.equal(B.store.writerState(), 'reader');
    A.store.suspend(); A.close();
    assert.equal(await within(B.store.requestWrite(), 1000, 'requestWrite()'), 'denied', 'erneut abgelehnt: als solche gemeldet, nicht als Zeitüberschreitung');
    deny = false;
    assert.equal(await within(B.store.requestWrite(), 1000, 'requestWrite()'), 'writer');
    assert.equal(B.store.writerFailure(), null);
    assert.deepEqual(b.violations, []);
  });
});
test('P55: bleibt die erste Sperranfrage unbeantwortet, enden Start und Übernahme innerhalb ihrer Frist', async () => {
  await noUnhandled(async () => {
    const b = browser(doc());
    let silent = true;
    b.hooks.request = (win, name, opts) => opts.ifAvailable && silent ? 'silent' : undefined;
    const A = windowStore(b, { timing: { start: 80, request: 40 } });
    const t0 = Date.now(), ready = A.store.ready();
    assert.equal(await within(A.store.requestWrite(), 500, 'requestWrite()'), 'timeout');
    assert.ok(Date.now() - t0 < 200, 'die Frist umfasst das Warten auf die erste Antwort: ' + (Date.now() - t0) + ' ms');
    assert.equal(await within(ready, 500, 'ready()'), 'reader');
    assert.ok(Date.now() - t0 < 300);
    // danach regulär: „Hier bearbeiten“ stellt an und erhält die freie Sperre
    silent = false;
    assert.equal(await A.store.requestWrite(), 'writer');
    assert.deepEqual(b.violations, []);
  });
});
test('P55: ohne nutzbare Web Locks kein automatisches ungesichertes Schreiben – erst nach ausdrücklicher Entscheidung', async () => {
  await noUnhandled(async () => {
    const variants = [null,
      { request: () => Promise.reject(Object.assign(new Error('denied'), { name: 'SecurityError' })) },
      { request() { throw new Error('nicht erlaubt'); } }];
    for (const locks of variants) {
      const st = new MemoryStorage({ 'lt-inflation': '2' });
      const s = Data.createStore(st, { locks, requireLocks: true });
      assert.equal(await within(s.ready(), 500, 'ready()'), 'unsupported');
      assert.throws(() => s.setItem('lt-inflation', '3'), e => e.code === 'READ_ONLY');
      assert.equal(st.getItem('lt-inflation'), '2'); assert.equal(st.getItem(Data.KEY), null);
      assert.equal(await s.requestWrite(), 'unsupported');
      assert.equal(s.allowSingle(), 'single');
      s.setItem('lt-inflation', '3');
      assert.equal(settings(st).inflationPercent, 3);
    }
  });
});

/* ── P63: Lebenszyklus ── */
test('P63: wer die Seite verlässt, gibt die Sperre wirklich frei, stellt sich nicht wieder an und erwirbt sie bei der Rückkehr neu', async () => {
  await noUnhandled(async () => {
    const b = browser(doc({ inflationPercent: 2 }));
    const A = windowStore(b); await A.store.ready();
    const B = windowStore(b); await B.store.ready();
    // A navigiert weg, das Dokument bleibt im bfcache
    A.store.suspend(); A.cached = true;
    assert.equal(A.store.writerState(), 'suspended');
    assert.equal(A.store.canWrite(), false);
    assert.ok(await until(() => B.store.canWrite()), 'B übernimmt, ohne dass A zurückkehrt');
    assert.equal(b.held(), B);
    assert.equal(b.queued(A), 0, 'A hat sich nicht wieder angestellt');
    B.store.setItem('lt-inflation', '5');
    assert.throws(() => A.store.setItem('lt-inflation', '9'), e => e.code === 'READ_ONLY');
    // Rückkehr: A lädt den Stand von B (die storage-Ereignisse fehlen ihm) und liest
    A.cached = false;
    const base = A.store.revision();
    assert.equal(A.store.reload(), true);
    assert.equal(await A.store.resume(), 'reader');
    assert.ok(A.store.revision() > base);
    assert.equal(A.store.getItem('lt-inflation'), '5');
    // B verlässt die Seite: A schreibt wieder, mit dem letzten Stand
    B.store.suspend(); B.cached = true;
    assert.ok(await until(() => A.store.canWrite()));
    A.store.setItem('lt-safety', '90');
    assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [5, 90]);
    assert.deepEqual(b.violations, []);
  });
});
test('P63: späte Rückrufe nach dem Verlassen geben eine erteilte Sperre sofort zurück und aktivieren kein Schreibrecht', async () => {
  await noUnhandled(async () => {
    const b = browser(doc());
    const A = windowStore(b); await A.store.ready();
    // B: Lock-API ohne Abbruch (ältere Browser) – die wartende Anfrage wird nach dem Verlassen noch erteilt
    const B = windowStore(b, { locks: raw => ({ request: (n, o, c) => typeof o === 'function' ? raw.request(n, o) : raw.request(n, { ifAvailable: o.ifAvailable }, c) }) });
    assert.equal(await B.store.ready(), 'reader');
    B.store.suspend();
    A.store.suspend(); A.close();
    await sleep(20);
    assert.equal(B.store.writerState(), 'suspended');
    assert.equal(B.store.canWrite(), false);
    assert.equal(b.held(), null, 'die verspätet erteilte Sperre ist sofort wieder frei');
    // C: die erste Antwort kommt erst nach dem Verlassen
    const gate = [];
    const C = windowStore(b, { locks: raw => ({ request: (n, o, c) => new Promise((res, rej) => gate.push(() => raw.request(n, o, c).then(res, rej))) }) });
    const ready = C.store.ready();
    C.store.suspend();
    gate.splice(0).forEach(go => go());
    assert.equal(await within(ready, 500, 'ready()'), 'suspended');
    await sleep(20);
    assert.equal(C.store.canWrite(), false);
    assert.equal(b.held(), null);
    const D = windowStore(b);
    assert.equal(await D.store.ready(), 'writer', 'ein neues Fenster bekommt die Sperre');
    assert.deepEqual(b.violations, []);
  });
});
test('P34/P55: gleichzeitige Übernahmeanfragen – zu keinem Zeitpunkt zwei schreibende Fenster', async () => {
  const b = browser(doc());
  const A = windowStore(b); await A.store.ready();
  const B = windowStore(b), C = windowStore(b);
  await B.store.ready(); await C.store.ready();
  const results = await Promise.all([B.store.requestWrite(), C.store.requestWrite()]);
  assert.equal(results.filter(r => r === 'writer').length, 1, results.join('/'));
  assert.equal(b.writers().length, 1);
  assert.equal(A.store.canWrite(), false);
  // auch das unterlegene Fenster kommt später an die Reihe, wenn das schreibende geht
  const winner = B.store.canWrite() ? B : C, other = winner === B ? C : B;
  winner.store.suspend(); winner.close();
  assert.ok(await until(() => other.store.canWrite() || A.store.canWrite()));
  assert.equal(b.writers().length, 1);
  assert.deepEqual(b.violations, []);
});
test('P34/P63: im lesenden und im verlassenen Fenster bleiben alle Schreibwege gesperrt', async () => {
  const b = browser(doc());
  const A = windowStore(b); await A.store.ready();
  const B = windowStore(b); await B.store.ready();
  const raw = b.shared.getItem(Data.KEY);
  const blocked = s => {
    const d = s.document(); d.forecast.settings.inflationPercent = 7;
    assert.throws(() => s.setItem('lt-inflation', '9'), e => e.code === 'READ_ONLY');
    assert.throws(() => s.removeItem('lt-monthly-withdraw'), e => e.code === 'READ_ONLY');
    s.beginTransaction(); s.setItem('lt-inflation', '9');
    assert.throws(() => s.commitTransaction(), e => e.code === 'READ_ONLY');
    assert.throws(() => s.importBackup(d), e => e.code === 'READ_ONLY');
    assert.throws(() => s.clear(), e => e.code === 'READ_ONLY');
    assert.throws(() => s.renameGroup(d.groups[0].id, 'Neu'), e => e.code === 'READ_ONLY');
    assert.throws(() => s.renamePosition(d.positions[0].id, 'Neu'), e => e.code === 'READ_ONLY');
  };
  blocked(B.store);
  A.store.suspend();
  blocked(A.store);
  assert.equal(b.shared.getItem(Data.KEY), raw);
});

/* ── Dieselben Abläufe in der App (index.html im Harness, ein Testbrowser für mehrere Fenster) ── */
function appWindow(b) {
  const w = b.open();
  const a = app(html, w.storage, { locks: w.locks });
  w.listen(k => a.fire('window', 'storage', { key: k }));
  w.canWrite = () => a.run('appStorage.canWrite()');
  a.run("selectedMonth='2026-10';_initDone=true;_showReadOnly=()=>{};_toast=t=>{globalThis.__toast=t;};globalThis.__asks=[];_ask=async o=>{__asks.push(o);return true;};renderLifetimePageCalcs=()=>{};");
  a.w = w;
  return a;
}
const state = a => a.run('appStorage.writerState()');
async function stateIs(a, s) { assert.ok(await until(() => state(a) === s), 'Zustand ' + s + ', ist ' + state(a)); }
const fill = (a, values) => { for (const [k, v] of Object.entries(values)) a.el(k).value = v; };
/* So zeigt das Lebensphasen-Sheet den Stand an (Ansparen bis 55, Weiterarbeiten bis 62, Rente ab 67) */
const phases = need => ({ 'lp-a2': '55', 'lp-growth': '', 'lp-a3': '62', 'lp-saving': '', 'lp-saving3': '', 'lp-draw': '', 'lp-a4': '67', 'lp-need3': need, 'lp-need4': '' });
/* Ein Fenster, das liest, beginnt eine Bearbeitung; ein anderes speichert und wird geschlossen; das erste übernimmt */
async function readerThenPromoted(seed, startB, changeA) {
  const b = browser(seed);
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  startB(B);
  changeA(A);
  A.fire('window', 'pagehide', { persisted: false }); A.w.close();
  await stateIs(B, 'writer');
  return { b, A, B };
}

test('P54 (verbindlicher Kontrollfall): B öffnet 3.200, A speichert 4.000 und schließt – Bs alter Entwurf überschreibt 4.000 nicht', async () => {
  const b = browser(doc());
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  // B öffnet Prognose → Lebensphasen: Bedarf im Vorruhestand 3.200 €; ein probeweises Speichern von 3.500 € wird abgelehnt
  B.run('openPhasesSheet()'); fill(B, phases('3.500'));
  B.run('_submitSheet()');
  assert.match(B.el('dsError').textContent, /Nur ansehen/);
  assert.equal(settings(b.shared).monthlySpending, 3200);
  B.el('lp-need3').value = '3.200';
  // A speichert 4.000 im selben Sheet und schließt danach sein Fenster
  A.run('openPhasesSheet()'); fill(A, phases('4.000'));
  A.run('_submitSheet()');
  assert.equal(settings(b.shared).monthlySpending, 4000);
  A.fire('window', 'pagehide', { persisted: false }); A.w.close();
  // B übernimmt automatisch; das alte Sheet ist noch offen und enthält 3.200
  await stateIs(B, 'writer');
  assert.equal(B.el('lp-need3').value, '3.200');
  B.run('globalThis.__toast=null;_submitSheet()');
  assert.equal(settings(b.shared).monthlySpending, 4000, 'kein stiller Rückfall auf 3.200 €');
  assert.notEqual(B.run('globalThis.__toast'), 'Gespeichert');
  assert.match(B.el('dsError').textContent, /^Nicht gespeichert: In einem anderen Fenster wurde inzwischen gespeichert\. Hier steht jetzt der aktuelle Stand\./, 'verständliche Konfliktentscheidung');
  assert.equal(B.run('_sheetOpen'), true, 'das Sheet ist mit dem aktuellen Stand wieder offen');
  assert.equal(B.el('lp-need3').value, '3.200', 'die Eingaben gehen nicht verloren');
  // erst ein ausdrückliches erneutes Speichern übernimmt die Werte dieses Fensters
  B.el('lp-need3').value = '3.600';
  B.run('_submitSheet()');
  assert.equal(settings(b.shared).monthlySpending, 3600);
  assert.deepEqual(b.violations, []);
});
test('P54: auch Kredit-Sheet und Kinder-Klärung speichern einen Entwurf vom alten Stand nicht', async () => {
  // Kredit-Sheet: Restschuld im Monatsstand
  const d = fixture([{ id: 'konto', group: 'Cash', cat: 'cash', value: 1000 }, { id: 'kredit', group: 'Kredit', cat: 'liab', value: 3000 }], {});
  let r = await readerThenPromoted({ [Data.KEY]: JSON.stringify(d) },
    B => { B.run("CSS={escape:String};document.querySelector=sel=>sel.includes('data-loan-name')?{value:'kredit'}:null;openLoanSheet('kredit')"); B.el('f-kredit').value = '2.500'; },
    A => A.run("appStorage.setItem('lt-inflation','3')"));
  r.B.run('_submitSheet()');
  const month = st => JSON.parse(st.getItem(Data.KEY)).snapshots.find(s => s.month === '2026-10').positions.find(p => p.positionId === 'kredit').value;
  assert.equal(month(r.b.shared), 3000);
  assert.equal(settings(r.b.shared).inflationPercent, 3);
  assert.match(r.B.el('dsError').textContent, /^Nicht gespeichert/);
  // Kinder-Klärung (Migrationsdialog): ein offener Jahrgang aus Schema 12
  const v12 = fixture(undefined, { saveUntilAge: 60, retirementAge: 60, pensionStartAge: 67, planningHorizonAge: 90 }); v12.schemaVersion = 12;
  v12.retirement.pensionDepots = [{ id: 'd1', name: 'Depot', personId: v12.retirement.primary.id, monthlyContribution: 150, childBirthYears: [2019.5] }];
  r = await readerThenPromoted({ [Data.KEY]: JSON.stringify(v12) },
    B => { B.run("document.querySelector=sel=>sel.includes('migKid')?{value:'year'}:null;openChildYearSheet('d1',2019.5)"); B.el('migKidYear').value = '2019'; },
    A => A.run("appStorage.setItem('lt-inflation','3')"));
  r.B.run('_submitSheet()');
  const depot = JSON.parse(r.b.shared.getItem(Data.KEY)).retirement.pensionDepots[0];
  assert.deepEqual(depot.unresolvedChildBirthYears, [2019.5], 'noch nicht geklärt');
  assert.equal(settings(r.b.shared).inflationPercent, 3);
  assert.match(r.B.el('dsError').textContent, /^Nicht gespeichert/);
});
test('P54: das Budget-Sheet speichert einen Entwurf vom alten Stand nicht', async () => {
  const d = Data.empty();
  d.budget = { items: [{ id: 'budget-1', name: 'Gehalt', category: 'einkommen', subcategory: '', kind: 'income', targetGroupId: null, monthlyAmounts: Array(12).fill(3000) }], standingOrders: [], oneTime: [] };
  const r = await readerThenPromoted({ [Data.KEY]: JSON.stringify(d) },
    B => {
      B.run("CSS={escape:String};openBudgetSheet({ref:'einkommen:budget-1'})");
      fill(B, Object.fromEntries([['b-name', 'Gehalt'], ['b-type', 'income'], ...Array.from({ length: 12 }, (_, i) => ['b-m' + i, '3.100'])]));
      B.el('b-customOn').getAttribute = () => 'true';
    },
    A => A.run("{const bd=loadBudgetData();bd.einkommen[0].values=Array(12).fill(3500);saveBudgetData(bd);}"));
  r.B.run('_submitSheet()');
  const amounts = JSON.parse(r.b.shared.getItem(Data.KEY)).budget.items[0].monthlyAmounts;
  assert.deepEqual([...new Set(amounts)], [3500], 'die Änderung aus A bleibt');
  assert.match(r.B.el('dsError').textContent, /^Nicht gespeichert/);
});
/* 15.10.2026: Haushalt und Altersvorsorge werden im Sheet bearbeitet (wie Vermögenswerte); dieselbe Regel gilt dort */
test('P54: das Personen-Sheet speichert Geburtsdaten vom alten Stand nicht', async () => {
  const r = await readerThenPromoted(doc(),
    B => { B.run("CSS={escape:String};openPersonSheet('me')"); fill(B, { 'hp-name': '', 'hp-by': '1980', 'hp-bm': '1' }); },
    A => A.run("appStorage.setItem('lt-birth-year','1984')"));
  r.B.run('_submitSheet()');
  assert.equal(JSON.parse(r.b.shared.getItem(Data.KEY)).retirement.primary.birthYear, 1984, 'die Änderung aus A bleibt');
  assert.match(r.B.el('dsError').textContent, /^Nicht gespeichert/);
});
test('P54: Daten-Bearbeiten speichert vom alten Stand nichts und nennt die Konfliktentscheidung', async () => {
  const r = await readerThenPromoted(doc(),
    B => {
      // Attrappen-DOM: Felder liegen nicht auf der Daten-Seite (closest), nur die eigene Geburtsjahr-Auswahl wird geändert
      B.run("{const g=document.getElementById;document.getElementById=id=>{const e=g(id);if(e&&!e.closest)e.closest=()=>null;return e;};}");
      B.run('enterEditMode()'); B.el('hh-birth-year').value = '1980';
    },
    A => A.run("appStorage.setItem('lt-birth-year','1984')"));
  r.B.run('saveEntry()');
  assert.equal(JSON.parse(r.b.shared.getItem(Data.KEY)).retirement.primary.birthYear, 1984, 'A bleibt gespeichert');
  const asks = r.B.json('__asks.map(o=>o.text)');
  assert.match(asks.at(-1), /^Nicht gespeichert: In einem anderen Fenster wurde inzwischen gespeichert/);
  assert.equal(r.B.run('_editMode'), true, 'Bearbeiten bleibt offen');
});
test('P54: speichert während der Import-Rückfrage ein anderes Fenster, wird nichts importiert', async () => {
  const b = browser(doc());
  const B = appWindow(b); await stateIs(B, 'writer');
  const imported = Data.createStore(new MemoryStorage(doc({ monthlySpending: 999 }))).exportBackup();
  B.context.during = async () => {
    // ein zweites Fenster übernimmt, speichert und wird geschlossen; B erhält das Schreibrecht zurück
    const C = appWindow(b); await stateIs(C, 'reader');
    assert.equal(await C.run('appStorage.requestWrite()'), 'writer');
    C.run("appStorage.setItem('lt-inflation','7')");
    C.fire('window', 'pagehide', {}); C.w.close();
    await stateIs(B, 'writer');
  };
  B.context.file = { name: 'sicherung.json', text: async () => JSON.stringify(imported) };
  B.run("_ask=async()=>{await during();return true;};showImportError=m=>{globalThis.__importError=m;};location.reload=()=>{globalThis.__reloaded=true;}");
  await B.run('handleDataUpload({target:{files:[file],value:"x"}})');
  assert.equal(settings(b.shared).inflationPercent, 7, 'die Speicherung des anderen Fensters bleibt');
  assert.equal(settings(b.shared).monthlySpending, 3200, 'nichts importiert');
  assert.match(B.run('globalThis.__importError'), /^Nichts geändert: In einem anderen Fenster wurde inzwischen gespeichert/);
  assert.equal(B.run('globalThis.__reloaded'), undefined);
});
test('P63: der Writer navigiert weg – der andere Tab übernimmt sofort; bei der Rückkehr erwirbt der alte neu und lädt den Stand', async () => {
  const b = browser(doc({ inflationPercent: 2 }));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  // A navigiert zu einer anderen Seite; das Dokument bleibt im bfcache
  A.fire('window', 'pagehide', { persisted: true }); A.w.cached = true;
  assert.equal(state(A), 'suspended');
  await stateIs(B, 'writer');
  B.run("appStorage.setItem('lt-inflation','4')");
  // Rückkehr (pageshow mit persisted): neu erwerben, Stand von B laden, nur lesen
  A.w.cached = false; A.fire('window', 'pageshow', { persisted: true });
  await stateIs(A, 'reader');
  assert.equal(A.run("appStorage.getItem('lt-inflation')"), '4');
  assert.throws(() => A.run("appStorage.setItem('lt-inflation','9')"), /Nur ansehen/);
  // B wird geschlossen: A übernimmt mit dem letzten Stand
  B.fire('window', 'pagehide', { persisted: false }); B.w.close();
  await stateIs(A, 'writer');
  A.run("appStorage.setItem('lt-safety','90')");
  assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [4, 90]);
  assert.deepEqual(b.violations, []);
});
test('P63: eingefroren (freeze) gilt wie verlassen; ein nur verdeckter Tab behält das Schreibrecht und gibt auf Bitte ab', async () => {
  const b = browser(doc());
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  // verdeckt: keine Änderung, die Bitte eines anderen Fensters wird beantwortet
  A.context.document.hidden = true; A.fire('document', 'visibilitychange');
  assert.equal(state(A), 'writer'); assert.equal(b.held(), A.w);
  assert.equal(await B.run('appStorage.requestWrite()'), 'writer');
  await stateIs(A, 'reader');
  // B wird eingefroren und wieder aufgenommen
  B.fire('document', 'freeze');
  assert.equal(state(B), 'suspended');
  await stateIs(A, 'writer');
  B.fire('document', 'resume');
  await stateIs(B, 'reader');
  // meldet eine Plattform pagehide ohne spätere Rückkehr über pageshow, erwirbt das Sichtbarwerden neu
  A.fire('window', 'pagehide', { persisted: true });
  await stateIs(B, 'writer');
  A.context.document.hidden = false; A.fire('document', 'visibilitychange');
  await stateIs(A, 'reader');
  assert.deepEqual(b.violations, []);
});
test('P55: „Hier bearbeiten“ bleibt nach einem Fehler bedienbar und erklärt ihn', async () => {
  const b = browser(doc());
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  B.run("appStorage.requestWrite=()=>Promise.reject(new Error('kaputt'))");
  await B.run('_takeOverWriting()');
  assert.equal(B.run('_takingOver'), false);
  assert.equal(B.el('roTake').disabled, false);
  assert.match(B.json('__asks.at(-1).text'), /Speichern war nicht möglich/);
});
test('P55: der Start zum Ansehen nach 3 s bleibt, auch wenn der Browser nie antwortet', () => {
  const never = { request: () => new Promise(() => {}) };
  const a = app(html, new MemoryStorage(doc()), { locks: never, ready: false });
  a.run('globalThis.__timers=[];setTimeout=(f,ms)=>{__timers.push([f,ms]);};globalThis.__init=0;initApp=()=>{__init++;};_showReadOnly=()=>{};');
  a.run('_startApp()');
  assert.deepEqual(a.json('__timers.map(t=>t[1])'), [3000]);
  assert.equal(a.run('__init'), 0);
  a.run('__timers[0][0]();__timers[0][0]()');
  assert.equal(a.run('__init'), 1, 'genau einmal gestartet');
  assert.equal(a.run('appStorage.canWrite()'), false);
});

/* ── Folge-Review 2 (.docs/REVIEW_2026-10_FOLGE2.md): P64 Identität im Abgleich, P65 sichere Übernahme ── */
const { createDocument, type } = require('./mini-dom.cjs');
const evDoc = list => {
  const d = fixture([{ id: 'konto', group: 'Cash', cat: 'cash', value: 1000 }], {});
  d.forecast.events = list.map(([id, name, year, amount]) => ({ id, name, year, amount, from: { type: 'liquid' }, to: { type: 'external' } }));
  return { [Data.KEY]: JSON.stringify(d) };
};
const evRows = list => JSON.stringify(list.map(([id, name, year, amount]) => ({ id, name, year, amount, from: '*', to: '' })));
const events = st => JSON.parse(st.getItem(Data.KEY)).forecast.events.map(e => [e.id, e.name, e.year, e.amount]);
/* Die Ereignisliste der Prognose-Annahmen in einem kleinen echten DOM; Fehler in Listenern gehen wie im Browser an
   den Fehlerhandler des Fensters */
function liveEvents(a) {
  const d = createDocument(), box = d.create('div', { id: 'lt-events' });
  d.root.appendChild(box);
  const orig = a.context.document.getElementById;
  a.context.document.getElementById = id => d.getElementById(id) || orig(id);
  a.context.Event = class { constructor(t, o = {}) { this.type = t; this.bubbles = !!o.bubbles; } };
  d.onerror = error => a.fire('window', 'error', { error, preventDefault() {} });
  a.run('_ltScheduleRender=()=>{};renderEventEditor()');
  return box;
}
const row = (box, id) => box.querySelectorAll('.plan-row').find(r => r.dataset.rowId === id);
const ids = box => box.querySelectorAll('.plan-row').map(r => r.dataset.rowId);
const note = box => box.querySelector('.plan-stale');

test('P64 (verbindlich): Löschen und Anlegen bei gleicher Länge – die Eingabe ins alte E1-Feld ändert weder Haus noch Reise', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000], ['E2', 'Haus', 2031, 20000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const box = liveEvents(B);
  assert.deepEqual(ids(box), ['E1', 'E2']);
  // A entfernt Auto und legt Reise an (gleiche Listenlänge) und schließt
  A.run(`appStorage.setItem('lt-events',${JSON.stringify(evRows([['E2', 'Haus', 2031, 20000], ['E3', 'Reise', 2032, 5000]]))})`);
  A.fire('window', 'pagehide', { persisted: false }); A.w.close();
  await stateIs(B, 'writer');
  const raw = b.shared.getItem(Data.KEY);
  type(row(box, 'E1').querySelector('[data-k="amount"]'), '11.000');
  assert.equal(b.shared.getItem(Data.KEY), raw, 'der Abgleich speichert nichts');
  assert.deepEqual(events(b.shared), [['E2', 'Haus', 2031, 20000], ['E3', 'Reise', 2032, 5000]], 'Haus 20.000 und Reise 5.000 bleiben');
  // neu gezeichnet mit dem aktuellen Stand; die eigene Eingabe bleibt sichtbar und wird als nicht übertragbar erklärt
  assert.deepEqual(ids(box), ['E2', 'E3']);
  assert.deepEqual(box.querySelectorAll('[data-k="amount"]').map(i => i.value), ['20000', '5000']);
  const n = note(box);
  assert.ok(n, 'Hinweis im Editor');
  assert.match(n.textContent, /Nicht gespeichert/);
  assert.match(n.textContent, /„Auto“/); assert.match(n.textContent, /11\.000/); assert.match(n.textContent, /entfernt/);
  assert.equal(n.querySelector('[data-plan-apply]'), null, 'nichts, was übernommen werden könnte');
});
test('P64: gleiche ID – dasselbe Feld fremd geändert: nichts automatisch, erst „Übernehmen“ speichert genau diese Eingabe', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000], ['E2', 'Haus', 2031, 20000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const box = liveEvents(B);
  A.run(`appStorage.setItem('lt-events',${JSON.stringify(evRows([['E1', 'Auto', 2030, 12000], ['E2', 'Haus', 2031, 20000]]))})`);
  A.fire('window', 'pagehide', {}); A.w.close();
  await stateIs(B, 'writer');
  type(row(box, 'E1').querySelector('[data-k="amount"]'), '11.000');
  assert.deepEqual(events(b.shared), [['E1', 'Auto', 2030, 12000], ['E2', 'Haus', 2031, 20000]], 'noch nichts gespeichert');
  assert.equal(row(box, 'E1').querySelector('[data-k="amount"]').value, '12000', 'das Feld zeigt den gespeicherten Stand');
  const n = note(box);
  assert.match(n.textContent, /„Auto“/); assert.match(n.textContent, /11\.000/); assert.match(n.textContent, /inzwischen gespeichert: 12000/i);
  n.querySelector('[data-plan-apply]').click();
  assert.deepEqual(events(b.shared), [['E1', 'Auto', 2030, 11000], ['E2', 'Haus', 2031, 20000]]);
  assert.equal(note(box), null);
  assert.equal(row(box, 'E1').querySelector('[data-k="amount"]').value, '11000');
});
test('P64: gleiche ID – ein anderes Feld fremd geändert: „Übernehmen“ setzt nur den eigenen Betrag, das fremde Jahr bleibt', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000], ['E2', 'Haus', 2031, 20000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const box = liveEvents(B);
  A.run(`appStorage.setItem('lt-events',${JSON.stringify(evRows([['E1', 'Auto', 2033, 10000], ['E2', 'Haus', 2031, 20000]]))})`);
  A.fire('window', 'pagehide', {}); A.w.close();
  await stateIs(B, 'writer');
  type(row(box, 'E1').querySelector('[data-k="amount"]'), '11.000');
  assert.deepEqual(events(b.shared), [['E1', 'Auto', 2033, 10000], ['E2', 'Haus', 2031, 20000]], 'noch nichts gespeichert');
  note(box).querySelector('[data-plan-apply]').click();
  assert.deepEqual(events(b.shared), [['E1', 'Auto', 2033, 11000], ['E2', 'Haus', 2031, 20000]], 'nicht der alte vollständige Zeileninhalt');
});
test('P64: umgeordnete Zeilen mit unveränderten IDs – die Eingabe gehört weiter zu Auto', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000], ['E2', 'Haus', 2031, 20000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const box = liveEvents(B);
  A.run(`appStorage.setItem('lt-events',${JSON.stringify(evRows([['E2', 'Haus', 2031, 20000], ['E1', 'Auto', 2030, 10000]]))})`);
  A.fire('window', 'pagehide', {}); A.w.close();
  await stateIs(B, 'writer');
  type(row(box, 'E1').querySelector('[data-k="amount"]'), '11.000');
  assert.deepEqual(events(b.shared), [['E2', 'Haus', 2031, 20000], ['E1', 'Auto', 2030, 10000]], 'noch nichts gespeichert');
  note(box).querySelector('[data-plan-apply]').click();
  assert.deepEqual(events(b.shared), [['E2', 'Haus', 2031, 20000], ['E1', 'Auto', 2030, 11000]]);
});
test('P64: fehlende oder mehrdeutige ID – nichts übertragen, nichts gespeichert, beide Eingaben erklärt', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000], ['E2', 'Haus', 2031, 20000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const box = liveEvents(B);
  // eine gezeichnete Zeile ohne Kennung und zwei mit derselben Kennung (z. B. aus einem fehlerhaften älteren Stand)
  B.run(`_planListEditor('lt-events','lt-events',[{id:'',name:'Ohne',year:2034,amount:100,from:'*',to:''},{id:'E2',name:'Haus',year:2031,amount:20000,from:'*',to:''},{id:'E2',name:'Haus',year:2031,amount:20000,from:'*',to:''}],EVENT_COLS,'Ereignis',()=>({}),null,'ev')`);
  type(box.querySelectorAll('.plan-row')[0].querySelector('[data-k="amount"]'), '150');/* im Lesefenster abgelehnt, bleibt sichtbar */
  A.run("appStorage.setItem('lt-inflation','3')");
  A.fire('window', 'pagehide', {}); A.w.close();
  await stateIs(B, 'writer');
  const raw = b.shared.getItem(Data.KEY);
  type(box.querySelectorAll('.plan-row')[2].querySelector('[data-k="amount"]'), '21.000');
  assert.equal(b.shared.getItem(Data.KEY), raw);
  const n = note(box);
  assert.match(n.textContent, /„Ohne“/); assert.match(n.textContent, /150/);
  assert.match(n.textContent, /„Haus“/); assert.match(n.textContent, /21\.000/);
  assert.match(n.textContent, /ohne eindeutige Kennung/);
  assert.equal(n.querySelector('[data-plan-apply]'), null);
});
test('P64: eine neue Zeile verwendet nach dem Speichern ihre gespeicherte ID und bleibt bei einem Konflikt dieselbe Zeile', async () => {
  const b = browser(evDoc([['E1', 'Auto', 2030, 10000]]));
  const B = appWindow(b); await stateIs(B, 'writer');
  const box = liveEvents(B);
  box.querySelector('.plan-add').click();
  const stored = () => JSON.parse(b.shared.getItem(Data.KEY)).forecast.events;
  const id = stored()[1].id;
  assert.ok(id, 'die neue Zeile hat eine gespeicherte ID');
  assert.deepEqual(ids(box), ['E1', id], 'gezeichnet mit der gespeicherten ID');
  type(row(box, id).querySelector('[data-k="name"]'), 'Reise');
  type(row(box, id).querySelector('[data-k="amount"]'), '5.000');
  assert.deepEqual(stored().map(e => [e.id, e.name, e.amount]), [['E1', 'Auto', 10000], [id, 'Reise', 5000]], 'dieselbe ID über alle Eingaben');
  // ein anderes Fenster ändert Auto; die Eingabe in der neuen Zeile bleibt ihr zugeordnet
  const C = appWindow(b); await stateIs(C, 'reader');
  assert.equal(await C.run('appStorage.requestWrite()'), 'writer');
  C.run(`appStorage.setItem('lt-events',JSON.stringify([{id:'E1',name:'Auto',year:2030,amount:9000,from:'*',to:''},{id:'${id}',name:'Reise',year:${stored()[1].year},amount:5000,from:'*',to:''}]))`);
  C.fire('window', 'pagehide', {}); C.w.close();
  await stateIs(B, 'writer');
  type(row(box, id).querySelector('[data-k="amount"]'), '6.000');
  assert.deepEqual(stored().map(e => [e.id, e.amount]), [['E1', 9000], [id, 5000]], 'noch nichts gespeichert');
  note(box).querySelector('[data-plan-apply]').click();
  assert.deepEqual(stored().map(e => [e.id, e.name, e.amount]), [['E1', 'Auto', 9000], [id, 'Reise', 6000]]);
});
test('P64: auch der allgemeine Abgleich (Sheets, Daten-Bearbeiten) ordnet Zeilen nur über ihre Kennung zu, nie nach Position', () => {
  const a = app(html, new MemoryStorage(doc()));
  const d = createDocument(), root = d.create('div', { id: 'dsBodyTest' }); d.root.appendChild(root);
  a.context.Event = class { constructor(t, o = {}) { this.type = t; this.bubbles = !!o.bubbles; } };
  a.context.document.createElement = tag => d.create(tag);
  a.context.root = root;
  const rowsHTML = list => list.map(([id, amt]) => `<div class="loan-extra-row" data-extra-id="${id}"><label>Betrag €<input type="text" data-extra-amount value="${amt}"></label></div>`).join('')
    + '<div class="free"><input type="text" data-note value="a"><input type="text" data-note value="b"></div>';
  root.innerHTML = rowsHTML([['x1', '100'], ['x2', '200']]);
  root.addEventListener('input', e => a.context._touch(e)); root.addEventListener('change', e => a.context._touch(e));
  a.context.__snap = a.run('_ctlState(root)');
  type(root.querySelectorAll('[data-extra-amount]')[0], '150');/* Sondertilgung x1 */
  type(root.querySelectorAll('[data-note]')[1], 'B');/* zwei gleichartige Felder ohne Kennung */
  a.context.__mine = a.run('_ctlChanges(root,__snap)');
  // anderes Fenster hat eine Sondertilgung x0 davor eingefügt
  root.innerHTML = rowsHTML([['x0', '50'], ['x1', '100'], ['x2', '200']]);
  const miss = a.run('_ctlApply(root,__mine)');
  assert.deepEqual(root.querySelectorAll('[data-extra-amount]').map(i => i.value), ['50', '150', '200'], 'x1 bekommt 150, nicht x0');
  assert.deepEqual(root.querySelectorAll('[data-note]').map(i => i.value), ['a', 'b'], 'nicht eindeutig: nichts übertragen');
  assert.deepEqual(Array.from(miss, m => m.show), ['B']);
});

/* nur die erste Sperranfrage wartet, bis der Test sie freigibt (fremdes Dokument erscheint vorher) */
const delayFirst = gate => raw => {
  let first = true;
  return { request: (n, o, c) => { if (!first) return raw.request(n, o, c); first = false; return new Promise((res, rej) => gate.push(() => raw.request(n, o, c).then(res, rej))); } };
};
test('P65 (A): unlesbares fremdes Dokument vor der ersten Sperrerteilung bleibt bytegleich, Sperre frei, Altschlüssel erhalten', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    const gate = [];
    const B = windowStore(b, { locks: delayFirst(gate) });
    const ready = B.store.ready();
    const newer = JSON.parse(JSON.stringify(Data.empty())); newer.schemaVersion = 999; newer.future = { x: 1 };
    const foreign = JSON.stringify(newer);
    b.open().storage.setItem(Data.KEY, foreign);/* eine neuere App-Version in einem anderen Fenster */
    gate.splice(0).forEach(go => go());
    assert.equal(await within(ready, 1000, 'ready()'), 'failed');
    assert.equal(B.store.canWrite(), false);
    assert.ok(await until(() => b.held() === null), 'Sperre frei');
    assert.equal(b.shared.getItem(Data.KEY), foreign, 'fremder Rohtext bytegleich');
    assert.equal(b.shared.getItem('lt-inflation'), '2', 'Altschlüssel erhalten');
    assert.equal(b.shared.getItem(Data.BACKUP_KEY), null);
    assert.match(String(B.store.writerFailure() && B.store.writerFailure().message), /nicht gelesen|Version 999/);
    // Korrektur: das fremde Dokument wird durch einen lesbaren aktuellen Stand ersetzt → geschützter Neuversuch
    const fixed = Data.createStore(new MemoryStorage({ 'lt-inflation': '3' })).exportBackup(); delete fixed.exportedAt;
    b.open().storage.setItem(Data.KEY, JSON.stringify(fixed));
    const now = b.shared.getItem(Data.KEY);
    assert.equal(await within(B.store.requestWrite(), 1000, 'requestWrite()'), 'writer');
    assert.equal(b.shared.getItem(Data.KEY), now, 'der vorhandene Stand wird übernommen, nicht ersetzt');
    assert.equal(B.store.getItem('lt-inflation'), '3');
    assert.deepEqual(b.violations, []);
  });
});
test('P65 (A, Korrektur durch Entfernen): ohne fremdes Dokument gelingt danach die Erstübernahme der alten Schlüssel', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    const gate = [];
    const B = windowStore(b, { locks: delayFirst(gate) });
    const ready = B.store.ready();
    b.open().storage.setItem(Data.KEY, '{"schemaVersion":999}');
    gate.splice(0).forEach(go => go());
    assert.equal(await within(ready, 1000, 'ready()'), 'failed');
    b.open().storage.removeItem(Data.KEY);
    const retry = B.store.requestWrite(); gate.splice(0).forEach(go => go());
    assert.equal(await within(retry, 1000, 'requestWrite()'), 'writer');
    assert.equal(settings(b.shared).inflationPercent, 2);
    assert.equal(b.shared.getItem('lt-inflation'), null, 'Altschlüssel erst nach dem sicheren Abschluss entfernt');
  });
});
test('P65 (B): gültiges Schema-15-Dokument während vorgemerkter Erstübernahme – Original dauerhaft bytegleich gesichert', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    const gate = [];
    const B = windowStore(b, { locks: delayFirst(gate) });
    const ready = B.store.ready();
    const old = fixture([{ id: 'konto', group: 'Cash', cat: 'cash', value: 1000 }], { inflationPercent: 4 }); old.schemaVersion = 15;
    const original = JSON.stringify(old);
    b.open().storage.setItem(Data.KEY, original);
    gate.splice(0).forEach(go => go());
    assert.equal(await within(ready, 1000, 'ready()'), 'writer');
    assert.equal(b.shared.getItem(Data.KEY), original, 'noch nicht ersetzt');
    assert.equal(B.store.getItem('lt-inflation'), '4', 'das vorhandene Dokument gilt, nicht die alten Schlüssel');
    B.store.setItem('lt-safety', '90');/* erste Speicherung des migrierten Stands */
    assert.equal(b.shared.getItem(Data.BACKUP_KEY), original, 'Original vor der ersten Speicherung gesichert');
    assert.equal(JSON.parse(b.shared.getItem(Data.KEY)).schemaVersion, Data.VERSION);
    B.store.setItem('lt-safety', '91');
    assert.equal(b.shared.getItem(Data.BACKUP_KEY), original, 'bleibt nach weiterer Änderung');
    const restarted = Data.createStore(new MemoryStorage({ ...b.shared.values })).backupBeforeUpdate();
    assert.deepEqual([restarted.raw === original, restarted.version, restarted.pending], [true, 15, false], 'und nach Neustart');
    assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [4, 91]);
  });
});
test('P65 (C): unlesbarer neuerer Stand vor einer späteren Übernahme – kein Writer, keine gehaltene Sperre, sicherer Neuversuch', async () => {
  await noUnhandled(async () => {
    const b = browser(doc());
    const A = windowStore(b); await A.store.ready();
    const B = windowStore(b); assert.equal(await B.store.ready(), 'reader');
    const foreign = '{"schemaVersion":999,"neu":true}';
    b.open().storage.setItem(Data.KEY, foreign);
    A.store.suspend(); A.close();
    assert.ok(await until(() => B.store.writerState() !== 'reader'));
    assert.equal(B.store.writerState(), 'failed');
    assert.equal(B.store.canWrite(), false);
    assert.ok(await until(() => b.held() === null), 'Sperre frei');
    assert.equal(b.shared.getItem(Data.KEY), foreign);
    assert.match(B.store.writerFailure().message, /nicht gelesen/);
    assert.equal(B.store.writerFailure().code, 'UNREADABLE');
    assert.throws(() => B.store.setItem('lt-inflation', '5'), e => e.code === 'READ_ONLY' && /nicht gelesen werden und bleiben unverändert/.test(e.message));
    // Korrektur: ein lesbarer Stand liegt wieder vor
    const fixed = JSON.parse(doc()[Data.KEY]); fixed.forecast.settings.inflationPercent = 1;
    b.open().storage.setItem(Data.KEY, JSON.stringify(fixed));
    assert.equal(await within(B.store.requestWrite(), 1000, 'requestWrite()'), 'writer');
    assert.equal(B.store.getItem('lt-inflation'), '1');
    assert.deepEqual(b.violations, []);
  });
});
test('P65 (D): gültiges aktuelles Dokument erscheint während vorgemerkter Erstübernahme – es wird übernommen, nicht überschrieben', async () => {
  await noUnhandled(async () => {
    const b = browser({ 'lt-inflation': '2' });
    const gate = [];
    const B = windowStore(b, { locks: delayFirst(gate) });
    const ready = B.store.ready();
    const other = Data.createStore(new MemoryStorage({ 'lt-inflation': '5', 'lt-safety': '80' })).exportBackup(); delete other.exportedAt;
    const current = JSON.stringify(other);
    b.open().storage.setItem(Data.KEY, current);
    gate.splice(0).forEach(go => go());
    assert.equal(await within(ready, 1000, 'ready()'), 'writer');
    assert.equal(b.shared.getItem(Data.KEY), current, 'nicht durch die alten Schlüssel ersetzt');
    assert.deepEqual([B.store.getItem('lt-inflation'), B.store.getItem('lt-safety')], ['5', '80']);
    B.store.setItem('lt-safety', '85');
    assert.deepEqual([settings(b.shared).inflationPercent, settings(b.shared).safetyPercent], [5, 85]);
    assert.equal(b.shared.getItem(Data.BACKUP_KEY), null, 'aktuelles Schema: keine Sicherung nötig');
  });
});
test('P64: eine neue Zeile erhält nie die Kennung einer gelöschten – ein alter Entwurf trifft sie nicht', async () => {
  const b = browser(evDoc([['event-1', 'Auto', 2030, 10000], ['event-2', 'Renovierung', 2031, 15000]]));
  const A = appWindow(b); await stateIs(A, 'writer');
  const B = appWindow(b); await stateIs(B, 'reader');
  const boxB = liveEvents(B), boxA = liveEvents(A);
  // A entfernt Renovierung und legt danach im Editor ein neues Ereignis an
  row(boxA, 'event-2').querySelector('[data-del]').click();
  boxA.querySelector('.plan-add').click();
  const fresh = JSON.parse(b.shared.getItem(Data.KEY)).forecast.events.map(e => e.id);
  assert.equal(fresh.length, 2);
  assert.ok(!fresh.includes('event-2'), 'die gelöschte Kennung wird nicht wiederverwendet: ' + fresh.join(', '));
  type(boxA.querySelectorAll('.plan-row').at(-1).querySelector('[data-k="name"]'), 'Reise');
  A.fire('window', 'pagehide', {}); A.w.close();
  await stateIs(B, 'writer');
  type(row(boxB, 'event-2').querySelector('[data-k="amount"]'), '11.000');
  const n = note(boxB);
  assert.match(n.textContent, /„Renovierung“.*entfernt/);
  assert.equal(n.querySelector('[data-plan-apply]'), null);
  assert.deepEqual(events(b.shared).map(e => e[3]), [10000, 0], 'nichts übertragen');
});
