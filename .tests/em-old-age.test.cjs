/* 15.10.2026, Schema 19: Erwerbsminderungsrente und spätere Altersrente.
   Erfasst werden die Entgeltpunkte laut Rentenbescheid (gesamt, mit Zurechnungszeit) und der darin enthaltene Anteil der
   Zurechnungszeit. Erwartungen aus dem SGB VI, nicht aus der Implementierung:
   - EM-Rente = Entgeltpunkte × Zugangsfaktor × Rentenartfaktor (teilweise 0,5, voll 1,0) × Rentenwert (§§ 64, 67, 77).
   - Altersrente aus Punkten: tatsächlich erworbene Punkte (gesamt − Zurechnungszeit) mit dem Zugangsfaktor der EM-Rente,
     bei teilweiser EM nur für die Hälfte, die andere Hälfte mit dem der Altersrente (§ 77 Abs. 3 Satz 1 und 2); neue Punkte
     aus Beschäftigung mit dem Zugangsfaktor der Altersrente (1,0 ab der Regelaltersgrenze).
   - Rechnerische Untergrenze nach heutigem Rentenrecht (Besitzschutz, § 88 Abs. 1 Satz 2): persönliche Entgeltpunkte der EM-Rente (gesamt ×
     Zugangsfaktor) × Rentenartfaktor 1,0, wenn die Altersrente spätestens 24 Monate nach dem Ende der EM-Rente beginnt.
   - Geschätzte Altersrente = der höhere Wert; die Zurechnungszeit zählt nie zusätzlich zu neuen Punkten.
   Rentenwert 42,52 €, 20 % Abzüge. Harness-Datum Oktober 2026; geboren Januar 1980 → 46,75 Jahre, Regelaltersgrenze 67. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const RW = 42.52, NET = 0.8, YEARS = 67 - 46.75;
function ctx(settings = {}) {
  const a = app(html);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-withdraw-from','67');");
  for (const [k, v] of Object.entries(settings)) a.run(`appStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))})`);
  return a;
}
const calc = (a, d) => a.json(`calcDrvPension(getLifetimeSettings(),_drvEmClean(Object.assign(getDrv(),${JSON.stringify(d)})))`);
/* Testfall aus der Rückfrage: 61,2256 Entgeltpunkte, davon 39,8909 Zurechnungszeit, Zugangsfaktor 0,892 */
const CASE = { emTotal: 61.2256, emZz: 39.8909, emZf: 0.892 };
const ACTUAL = 61.2256 - 39.8909, PEP = 61.2256 * 0.892;

test('teilweise EM: EM-Rente aus den Entgeltpunkten laut Bescheid, Untergrenze mit Rentenartfaktor 1,0', () => {
  const a = ctx();
  const r = calc(a, { ...CASE, emType: 1 });
  near(r.em.gross, 61.2256 * 0.892 * 0.5 * RW * NET);
  assert.equal(r.em.derived, true, 'ohne Zahlbetrag aus den Entgeltpunkten');
  near(r.em.pep, PEP);
  near(r.minimum, PEP * 1.0 * RW * NET);
  near(r.minimum, 2 * r.em.gross, 1e-6);
  near(r.inp.points, ACTUAL, 1e-9);
  // § 77 Abs. 3 Satz 2: die Hälfte der Punkte mit 0,892, die andere mit 1,0
  near(r.zfPts, 0.5 * 0.892 + 0.5 * 1);
  near(r.calcNetto, ACTUAL * 0.946 * RW * NET);
  near(r.netto, r.minimum);
  assert.equal(r.besitz, true);
});

test('volle EM: Zugangsfaktor der EM-Rente für alle alten Punkte; neue Punkte aus Beschäftigung können die Untergrenze übersteigen', () => {
  const a = ctx();
  const only = calc(a, { emType: 2, emTotal: 40, emZz: 15, emZf: 0.9 });
  near(only.em.gross, 40 * 0.9 * 1 * RW * NET);
  near(only.zfPts, 0.9, 1e-12);
  near(only.minimum, 40 * 0.9 * RW * NET);
  near(only.calcNetto, 25 * 0.9 * RW * NET);
  near(only.netto, only.minimum);
  // ein Durchschnittsentgelt im Jahr bis 67 = 1 Punkt je Jahr; Grenze laut Bescheid, damit nichts angerechnet wird
  const working = calc(a, { emType: 2, emTotal: 40, emZz: 15, emZf: 0.9, salary: 51944, emLimit: 60000 });
  near(working.epNew, YEARS);
  near(working.calcNetto, (25 * 0.9 + YEARS) * RW * NET);
  assert.ok(working.calcNetto > working.minimum);
  near(working.netto, working.calcNetto);
  assert.equal(working.besitz, false);
  near(working.minimum, only.minimum, 1e-9, 'die Untergrenze hängt nicht von neuen Punkten ab');
});

test('keine doppelte Zurechnungszeit: neue Punkte kommen nur zu den tatsächlich erworbenen dazu', () => {
  const a = ctx();
  const r = calc(a, { ...CASE, emType: 1, salary: 25000 });
  const epNew = 25000 / 51944 * YEARS;
  near(r.epNew, epNew);
  near(r.calcNetto, (ACTUAL * 0.946 + epNew) * RW * NET);
  assert.ok(r.calcNetto < (61.2256 * 0.946 + epNew) * RW * NET - 1, 'die Zurechnungszeit steckt nicht im Zweig aus Punkten');
  // Mehr Zurechnungszeit bei gleichem Gesamtwert: weniger tatsächliche Punkte, gleiche Untergrenze und EM-Rente
  const more = calc(a, { ...CASE, emZz: 45, emType: 1, salary: 25000 });
  assert.ok(more.calcNetto < r.calcNetto);
  near(more.minimum, r.minimum, 1e-9); near(more.em.gross, r.em.gross, 1e-9);
  // Gesamtwert und Zurechnungszeit ergeben dieselben Punkte wie die tatsächlich erworbenen allein (ohne Bescheid)
  const plain = calc(a, { points: ACTUAL, salary: 25000 });
  near(r.epTotal, plain.epTotal, 1e-9);
  // Breakeven: erst wenn neue Punkte die Untergrenze übersteigen, zählen sie (geschätzt), nie beides zusammen
  assert.ok(r.netto <= Math.max(r.minimum, r.calcNetto) + 1e-9);
  near(r.netto, r.minimum);
});

test('Zurechnungszeit ohne Gesamtwert oder größer als der Gesamtwert wird abgelehnt (App und Speicher)', () => {
  const a = ctx();
  assert.throws(() => a.run("_drvEmCheck({emType:1,emZz:10},'Ich')"), /Entgeltpunkte laut Bescheid \(gesamt\)/);
  assert.throws(() => a.run("_drvEmCheck({emType:1,emTotal:30,emZz:31},'Ich')"), /nicht größer/);
  a.run("_drvEmCheck({emType:1,emTotal:30,emZz:30},'Ich')");
  const doc = a.json('appStorage.exportBackup()');
  const bad = sp => { const d = JSON.parse(JSON.stringify(doc)); d.retirement.primary.statutoryPension = sp; return d; };
  assert.throws(() => Data.validate(bad({ disabilityType: 1, disabilityPension: 900, disabilityCreditedPoints: 10 })), /Zurechnungszeit/);
  assert.throws(() => Data.validate(bad({ disabilityType: 1, disabilityTotalPoints: 30, disabilityCreditedPoints: 31 })), /höchstens/);
  assert.throws(() => Data.validate(bad({ disabilityType: 1, disabilityTotalPoints: 30, points: 5 })), /nicht zusätzlich/);
  Data.validate(bad({ disabilityType: 1, disabilityTotalPoints: 30, disabilityCreditedPoints: 12 }));
  // Rentenpunkte entfallen beim Bereinigen, sobald Entgeltpunkte laut Bescheid eingetragen sind
  assert.equal(a.json("'points' in _drvEmClean({emType:1,points:20,emTotal:30})"), false);
  assert.equal(a.json("_drvEmClean({emType:1,points:20}).points"), 20, 'ohne Bescheidwert bleiben sie');
});

test('Übergang zur Altersrente: Regelaltersgrenze, Zugangsfaktor 1,0, Besitzschutz nur innerhalb von 24 Monaten', () => {
  const a = ctx({ 'lt-pension-age': 69 });
  const r = calc(a, { ...CASE, emType: 1 });
  assert.equal(r.age, 67, 'die EM-Rente wird zur Regelaltersgrenze zur Altersrente, auch wenn die Rentenphase später beginnt');
  assert.equal(r.zf, 1);
  // Endet die EM-Rente vorher, beginnt die Altersrente mit der Rentenphase (69): drei Jahre Abstand, kein Besitzschutz
  assert.equal(calc(a, { ...CASE, emType: 2, emUntil: 2045 }).minimum, 0);
  const b = ctx();
  const within = calc(b, { ...CASE, emType: 2, emUntil: 2045 }); // endet mit 66, Altersrente mit 67
  assert.ok(within.minimum > 0);
  const later = calc(b, { ...CASE, emType: 2, emUntil: 2043 }); // endet mit 64: mehr als 24 Monate
  assert.equal(later.minimum, 0);
  near(later.netto, later.calcNetto);
});

test('Besitzschutz in persönlichen Entgeltpunkten, nicht als doppelter Zahlbetrag; ohne Bescheidwert aus dem Zahlbetrag', () => {
  const a = ctx();
  // Zahlbetrag laut Bescheid mit eigenen Abzügen (z. B. nur Kranken- und Pflegeversicherung, 11 %)
  const pay = 61.2256 * 0.892 * 0.5 * RW * 0.89;
  const r = calc(a, { ...CASE, emType: 1, em: pay });
  near(r.em.gross, pay, 1e-9, 'die EM-Rente selbst bleibt der Zahlbetrag');
  near(r.minimum, PEP * RW * NET);
  assert.ok(Math.abs(r.minimum - 2 * pay) > 100, 'nicht der doppelte Zahlbetrag mit anderen Abzügen');
  assert.equal(r.em.pepFromPay, false);
  const only = calc(a, { emType: 1, em: 700 });
  assert.equal(only.em.pepFromPay, true);
  near(only.em.pep, 700 / (0.5 * RW * NET));
  near(only.minimum, 1400, 1e-9);
});

/* Sollwerte geändert (15.10.2026, Transparenz): Die Hauptzeile zeigt nur die verwendete Prognose; beide Wege und der
   maßgebliche stehen eingeklappt unter „Berechnung“ (_drvCalcHTML), auf der Prognose-Seite in der Erklärung. Die eigenständige
   Rechnung heißt „Vereinfachte Prognose aus Beitragszeiten“. Ausführliche Fälle in em-transparency.test.cjs. */
test('Anzeige: vereinfachte Modellrechnung, verwendete Prognose in der Hauptzeile, Aufschlüsselung eingeklappt, kein garantierter Betrag', () => {
  const a = ctx();
  a.run(`appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),${JSON.stringify({ ...CASE, emType: 1, salary: 25000 })})))`);
  const line = a.run("(()=>{const d=getDrv();return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()");
  assert.match(line, /^Altersrente ab 67 · vereinfachte Modellrechnung: ≈ <strong>1\.858 €<\/strong> netto\/Monat/);
  assert.match(line, /<details class="pv-calc-d"><summary>Berechnung<\/summary>/);
  assert.match(line, /61,2256 laut Bescheid − 39,8909 Zurechnungszeit/);
  assert.match(line, /kein garantierter künftiger Nettobetrag/);
  assert.doesNotMatch(line, /gesichert|Mindestleistung/);
  const ex = a.run('_explainDrv(calcDrvPension(getLifetimeSettings(),getDrv()))');
  assert.match(ex, /Rechnerische Untergrenze nach heutigem Rentenrecht/);
  assert.match(ex, /Grundlage: Besitzschutz \(§ 88 Abs\. 1 Satz 2 SGB VI\)/);
  assert.match(ex, /Persönliche Entgeltpunkte der EM-Rente: 61,2256 × 0,892 Zugangsfaktor = <b>54,6132<\/b>/);
  assert.match(ex, /je zur Hälfte 0,892 der EM-Rente und 1 der Altersrente \(§ 77 Abs\. 3 Satz 2 SGB VI\)/);
  assert.match(ex, /§ 58 Abs\. 1 Satz 1 Nr\. 5 SGB VI/);
  assert.doesNotMatch(ex, /[Gg]esichert|Mindestleistung/);
  assert.match(a.run("_explainEm(calcDrvPension(getLifetimeSettings(),getDrv()),'',true)"), /rechnerisch mindestens 1\.858 € \(vereinfachte Modellrechnung\)/);
  assert.equal(a.run('_drvMinTxt(calcDrvPension(getLifetimeSettings(),getDrv()))'), ' · vereinfachte Modellrechnung');
  assert.equal(a.run('_drvMinTxt(calcDrvPension(getLifetimeSettings(),{...getDrv(),emType:0}))'), '', 'ohne EM-Rente keine Kennzeichnung');
});

test('Migration 18 → 19: getrennte Zurechnungszeit wird zum Gesamtwert, die tatsächlichen Punkte bleiben gleich', () => {
  const s18 = Data.createStore(new MemoryStorage());
  const doc = s18.exportBackup(); doc.schemaVersion = 18;
  doc.retirement.primary.statutoryPension = { points: 21.3347, disabilityType: 1, disabilityPension: 1033.42, disabilityCreditedPoints: 39.8909, disabilityAccessFactor: 0.892 };
  doc.retirement.people = [
    { id: 'person-2', name: 'Miri', birthYear: 1990, statutoryPension: { points: 30, disabilityType: 2, disabilityPension: 1200 } },
    { id: 'person-3', name: 'Kim', birthYear: 1991, statutoryPension: { points: 12, disabilityCreditedPoints: 5 } }];
  const raw = JSON.stringify(doc);
  const st = new MemoryStorage(); st.setItem(Data.KEY, raw);
  const store = Data.createStore(st);
  const r = store.document().retirement;
  assert.equal(store.document().schemaVersion, Data.VERSION, 'auf die aktuelle Version (mindestens 19) gehoben');
  assert.deepEqual(r.primary.statutoryPension, { disabilityType: 1, disabilityPension: 1033.42, disabilityCreditedPoints: 39.8909, disabilityAccessFactor: 0.892, disabilityTotalPoints: 61.2256 });
  // ohne Zurechnungszeit offen, ob die Punkte sie enthalten: unverändert
  assert.deepEqual(r.people[0].statutoryPension, { points: 30, disabilityType: 2, disabilityPension: 1200 });
  // ohne EM-Art wirkungslos: unverändert
  assert.deepEqual(r.people[1].statutoryPension, { points: 12, disabilityCreditedPoints: 5 });
  // tatsächlich erworben wie in Schema 18 (dort points); Original vor dem ersten Speichern gesichert
  const a = app(html, st);
  near(a.json('_emPoints(getDrv()).actual'), 21.3347, 1e-9);
  store.setItem('lt-birth-year', '1980');
  assert.equal(JSON.parse(st.getItem(Data.BACKUP_KEY)).schemaVersion, 18);
});

test('Altdaten: EM-Rente mit Rentenpunkten ohne Zurechnungszeit rechnet wie bisher und wird zur Klärung angeboten', () => {
  const a = ctx();
  a.run("appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{points:30,emType:2,em:1200})))");
  const r = calc(a, { points: 30, emType: 2, em: 1200 });
  assert.equal(r.ptsLegacy, true);
  near(r.inp.points, 30);
  near(r.calcNetto, 30 * 0.892 * RW * NET, 1e-6);
  near(r.minimum, 1200, 1e-9, 'wie bisher: volle EM-Rente aus dem Zahlbetrag');
  const tasks = a.json('_migrationTasks().filter(t=>t.kind==="em")');
  assert.equal(tasks.length, 1); assert.equal(tasks[0].points, 30);
  assert.match(a.run('_migrationCardHTML()'), /Entgeltpunkte der EM-Rente klären/);
  // Klärung: die 30 Punkte waren ohne Zurechnungszeit, Zurechnungszeit 12 → gesamt 42
  a.run("_applyEmLegacy('','actual',12)");
  const d = a.json("JSON.parse(appStorage.getItem('lt-drv'))");
  assert.equal(d.emTotal, 42); assert.equal(d.emZz, 12); assert.equal('points' in d, false);
  near(a.json('_emPoints(getDrv()).actual'), 30, 1e-9, 'tatsächlich erworben unverändert');
  assert.equal(a.json('_migrationTasks().filter(t=>t.kind==="em").length'), 0);
  // weitere Person: die Punkte waren schon der Gesamtwert laut Bescheid
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'p1',name:'Miri',by:1990,points:40,emType:1,em:600}]))");
  assert.throws(() => a.run("_applyEmLegacy('p1','total',41)"), /nicht größer/);
  a.run("_applyEmLegacy('p1','total',15)");
  const p = a.json('getDrvExtra()[0]');
  assert.equal(p.emTotal, 40); assert.equal(p.emZz, 15); assert.equal('points' in p, false);
  near(a.json("calcDrvExtra(getLifetimeSettings(),getDrvExtra()[0]).inp.points"), 25, 1e-9);
});

test('Schema 19: Entgeltpunkte laut Bescheid und Zurechnungszeit werden gespeichert, exportiert und importiert', () => {
  const a = ctx();
  a.run(`appStorage.setItem('lt-drv',JSON.stringify(_drvEmClean(Object.assign(getDrv(),${JSON.stringify({ ...CASE, emType: 1 })}))))`);
  const sp = a.json('appStorage.document().retirement.primary.statutoryPension');
  assert.equal(sp.disabilityTotalPoints, 61.2256); assert.equal(sp.disabilityCreditedPoints, 39.8909);
  assert.equal('points' in sp, false);
  const doc = a.json('appStorage.exportBackup()');
  assert.ok(doc.schemaVersion >= 19 && doc.schemaVersion === Data.VERSION);
  const b = Data.createStore(new MemoryStorage()); b.importBackup(JSON.parse(JSON.stringify(doc)));
  assert.equal(JSON.parse(b.getItem('lt-drv')).emTotal, 61.2256);
  const v18 = JSON.parse(JSON.stringify(doc)); v18.schemaVersion = 18;
  assert.throws(() => Data.validate(v18), /disabilityTotalPoints|Gesetzliche Rente/);
});

test('Englischer Modus: Ergebniszeile und Erklärung ohne deutsche Begriffe', () => {
  const a = ctx();
  a.run(`appStorage.setItem('lt-drv',JSON.stringify(_drvEmClean(Object.assign(getDrv(),${JSON.stringify({ ...CASE, emType: 1, salary: 25000 })}))));appStorage.setItem('appLang','en');_lang=_readLang();`);
  const line = a.run("(()=>{const d=getDrv();return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()");
  const ex = a.run('_explainDrv(calcDrvPension(getLifetimeSettings(),getDrv()))');
  assert.match(line, /simplified model calculation/); assert.match(line, /<summary>Calculation<\/summary>/);
  assert.match(ex, /Simplified forecast from contribution periods/); assert.match(ex, /Calculated lower bound under current pension law/);
  assert.match(ex, /Forecast used/); assert.match(ex, /Simplified model calculation/);
  for (const t of [line, ex]) assert.doesNotMatch(t, /Entgeltpunkte|Zurechnungszeit|Modellrechnung|geschätzt|netto|Untergrenze|Beitragszeiten|Berechnung|guaranteed (minimum|at least)/);
});
