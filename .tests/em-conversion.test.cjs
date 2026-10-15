/* 15.10.2026: Erwerbsminderungsrente mit getrennt erfasster Zurechnungszeit, Zugangsfaktor und Besitzschutz bei der
   Umwandlung in die Altersrente, individuelle Hinzuverdienstgrenze (Schema 18); Altersvorsorgedepot im Vorruhestand;
   Phasenbalken je Person und Infobox der Prognose. Erwartungen aus SGB VI (§ 77 Abs. 3, § 88, § 96a) und einfacher
   Arithmetik mit Rentenwert 42,52 € und 20 % Abzügen. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const RW = 42.52, NET = 0.8;
/* geboren Januar 1980 (Harness-Datum Oktober 2026: 46,75 Jahre), Regelaltersgrenze 67 */
function ctx(settings = {}) {
  const a = app(html);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','67');appStorage.setItem('lt-withdraw-from','67');");
  for (const [k, v] of Object.entries(settings)) a.run(`appStorage.setItem(${JSON.stringify(k)},${JSON.stringify(String(v))})`);
  return a;
}
const calc = (a, d) => a.json(`calcDrvPension(getLifetimeSettings(),Object.assign(getDrv(),${JSON.stringify(d)}))`);

test('EM aus tatsächlichen Punkten und Zurechnungszeit; Altersrente mindestens deren persönliche Entgeltpunkte', () => {
  const a = ctx();
  const r = calc(a, { points: 20, emZz: 15, emType: 2, emZf: 0.9 });
  near(r.em.gross, 35 * 0.9 * 1 * RW * NET);
  assert.equal(r.em.derived, true, 'ohne Zahlbetrag aus Punkten berechnet');
  near(r.calcNetto, 20 * 0.9 * RW * NET, 1e-6);
  near(r.em.full, r.em.gross);
  near(r.netto, r.em.gross);
  assert.equal(r.besitz, true);
});

test('Beschäftigung neben der EM-Rente: neue Punkte zählen mit Faktor 1, die Zurechnungszeit nicht noch einmal', () => {
  const a = ctx();
  const r = calc(a, { points: 20, emZz: 15, emType: 2, emZf: 0.9, em: 1100, salary: 51944, emLimit: 60000 });
  near(r.epNew, 67 - 46.75);
  near(r.calcNetto, (20 * 0.9 + (67 - 46.75)) * RW * NET);
  assert.ok(r.calcNetto > r.em.full, 'eigene Punkte bringen mehr als der Besitzschutz');
  near(r.netto, r.calcNetto);
  // Zurechnungszeit getrennt: die eigene Rechnung enthält die 15 Punkte nicht
  assert.ok(r.calcNetto < (35 * 0.9 + (67 - 46.75)) * RW * NET - 1);
  assert.equal(r.em.cut, 0, 'Hinzuverdienst unter der Grenze laut Bescheid');
});

test('teilweise EM: Rentenartfaktor 0,5; die Altersrente bekommt Faktor 1,0, also mindestens das Doppelte', () => {
  const a = ctx();
  const r = calc(a, { points: 20, emZz: 15, emType: 1 });
  near(r.em.gross, 35 * 0.892 * 0.5 * RW * NET);
  near(r.em.full, 2 * r.em.gross);
  near(r.netto, 2 * r.em.gross);
  assert.equal(r.em.zf, 0.892, 'ohne Angabe der höchste Abschlag');
});

test('Besitzschutz nur, wenn die Altersrente höchstens 24 Monate nach dem Ende der EM-Rente beginnt', () => {
  const a = ctx();
  const within = calc(a, { points: 20, emType: 2, em: 1200, emUntil: 2045 });
  assert.ok(within.em.full > 0, 'Ende mit 66, Altersrente mit 67');
  const later = calc(a, { points: 20, emType: 2, em: 1200, emUntil: 2043 });
  assert.equal(later.em.full, 0, 'Ende mit 64: mehr als 24 Monate Abstand');
  near(later.netto, later.calcNetto);
});

test('individuelle Hinzuverdienstgrenze bei beiden Arten; ohne Angabe die gesetzliche', () => {
  const a = ctx();
  const std = calc(a, { points: 20, emType: 2, em: 1000, salary: 25000 });
  near(std.em.limit, 20763.75);
  near(std.em.cut, 0.4 * (25000 - 20763.75) / 12 * NET);
  const own = calc(a, { points: 20, emType: 2, em: 1000, salary: 25000, emLimit: 30000 });
  assert.equal(own.em.limit, 30000); assert.equal(own.em.cut, 0);
  const part = calc(a, { points: 20, emType: 1, em: 500, salary: 30000, emLimit: 20000 });
  assert.equal(part.em.limit, 20000, 'Bescheid-Grenze gilt auch unter dem Mindestwert');
  assert.equal(a.run("_emLimitPh(2)"), '20.764');
});

test('Abgleich: Punkte und Zurechnungszeit passen nicht zum Bescheid → Hinweis; Zugangsfaktor auch als Prozent', () => {
  const a = ctx();
  const html1 = a.run(`(()=>{const d=Object.assign(getDrv(),{points:20,emZz:15,emType:2,em:500});return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()`);
  assert.match(html1, /Punkte und Zurechnungszeit ergeben/);
  const html2 = a.run(`(()=>{const d=Object.assign(getDrv(),{points:20,emZz:15,emType:2,em:${(35 * 0.892 * RW * NET).toFixed(2)}});return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()`);
  assert.doesNotMatch(html2, /Punkte und Zurechnungszeit ergeben|Zurechnungszeit\? Dann/);
  assert.equal(a.json("_drvEmClean({emType:2,em:900,emZf:89.2,emZz:''}).emZf"), 0.892);
  assert.equal(a.json("'emZz' in _drvEmClean({emType:2,em:900,emZz:0})"), false);
});

test('Schema 18: Zurechnungszeit und Zugangsfaktor werden gespeichert, exportiert und geprüft', () => {
  const a = ctx();
  a.run("appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{points:20,emType:2,em:900,emZz:12.5,emZf:0.9})))");
  const sp = a.json('appStorage.document().retirement.primary.statutoryPension');
  assert.equal(sp.disabilityCreditedPoints, 12.5); assert.equal(sp.disabilityAccessFactor, 0.9);
  assert.equal(a.json('getDrv().emZz'), 12.5);
  const doc = a.json('appStorage.exportBackup()');
  assert.equal(doc.schemaVersion, 18);
  const b = Data.createStore(new MemoryStorage()); b.importBackup(JSON.parse(JSON.stringify(doc)));
  assert.equal(b.document().retirement.primary.statutoryPension.disabilityCreditedPoints, 12.5);
  const v17 = JSON.parse(JSON.stringify(doc)); v17.schemaVersion = 17;
  assert.throws(() => Data.validate(v17), /disabilityCreditedPoints|Gesetzliche Rente/);
  const bad = JSON.parse(JSON.stringify(doc)); bad.retirement.primary.statutoryPension.disabilityAccessFactor = 1.2;
  assert.throws(() => Data.validate(bad), /Zugangsfaktor/);
});

test('Altersvorsorgedepot: im Vorruhestand weder Beiträge noch Zulagen, das Kapital verzinst sich bis zur Auszahlung weiter', () => {
  const run = p3 => {
    const a = app(html);
    a.run(`appStorage.setItem('lt-birth-year','1985');appStorage.setItem('lt-save-until','60');appStorage.setItem('lt-withdraw-from','60');appStorage.setItem('lt-pension-age','67');appStorage.setItem('lt-p3-pension','${p3}');`);
    return a.json("(()=>{const s=getLifetimeSettings(),d={contrib:100,ret:5,from:67,deduct:0},q=_avdParams(s,d),r=calcAvDepot(s,d);return {f44:q.factor(2044),f45:q.factor(2045),f50:q.factor(2050),cap:r.capReal,own:r.ownSum,sub:r.subSum};})()");
  };
  const none = run(0), full = run(100);
  assert.deepEqual([full.f44, full.f45, full.f50], [1, 0, 0], 'Beiträge bis zum Jahr vor dem Arbeitsende mit 60');
  near(full.cap, none.cap, 1e-6); near(full.own, none.own, 1e-6); near(full.sub, none.sub, 1e-6);
  assert.ok(none.cap > none.own + none.sub, 'die Rendite wirkt auch zwischen 60 und 67');
});

test('Prognose: Phasenbalken je Person auf derselben Zeitachse, Alter der Person', () => {
  const a = ctx();
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'p1',name:'Claudia',by:1987,until:60,points:20}]))");
  const bar = a.run("_personBarHTML(getLifetimeSettings(),getDrvExtra()[0],95)");
  assert.match(bar, /class="lp-p1"/); assert.match(bar, /class="lp-p4"/);
  assert.match(bar, /<span class="last" style="left:100%">88<\/span>/, 'endet mit deinem Planhorizont, in ihrem Alter');
  assert.match(bar, /<span class="first" style="left:0%">heute<\/span>/);
});

test('Infobox: begrenzte Höhe, Text scrollt, Tabelle in eigenem Rahmen; Hinweis auf die Annahmen der Prognose-Seite', () => {
  assert.match(html, /#infoPopup \.info-popup-text\{flex:1 1 auto;min-height:0;overflow-y:auto/);
  assert.match(html, /#infoPopup\.show\{display:flex;flex-direction:column;width:min\(520px,92vw\);max-height:min\(84vh,760px\)/);
  assert.match(html, /<div class="se-wrap"><table class="se-t">/);
  assert.match(html, /Ändern unter Prognose → Annahmen → Rendite &amp; Sparrate je Asset\./);
});
