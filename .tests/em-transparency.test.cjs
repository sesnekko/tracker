/* 15.10.2026: Transparenz der Altersrentenprognose nach einer EM-Rente (Rechnung unverändert). Getrennt gezeigt werden
   1. die vereinfachte Prognose aus Beitragszeiten (tatsächlich erworbene Punkte = Bescheid − Zurechnungszeit, zusätzliche
      Punkte bis zum Arbeitsende laut Lebensphasen, Zugangsfaktoren nach § 77 Abs. 3 SGB VI),
   2. die rechnerische Untergrenze nach heutigem Rentenrecht (§ 88 Abs. 1 Satz 2: persönliche Entgeltpunkte der EM-Rente ×
      Rentenartfaktor 1,0 × heutiger Rentenwert − Abzüge),
   3. die verwendete Prognose (der höhere Wert, nie die Summe) und welcher Weg maßgeblich ist.
   Sollwerte aus diesen Formeln mit Rentenwert 42,52 €, 20 % Abzügen, Durchschnittsentgelt 51.944 €. Harness Oktober 2026,
   geboren Januar 1980 → 46,75 Jahre, Regelaltersgrenze 67. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const RW = 42.52, NET = 0.8, DE = 51944, NOW = 46.75;
function ctx(workUntil = 67) {
  const a = app(html);
  a.run(`appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-save-until','${workUntil}');appStorage.setItem('lt-withdraw-from','${workUntil}');`);
  return a;
}
const r = (a, d) => a.json(`calcDrvPension(getLifetimeSettings(),_drvEmClean(Object.assign(getDrv(),${JSON.stringify(d)})))`);
const line = (a, d) => a.run(`(()=>{const d=_drvEmClean(Object.assign(getDrv(),${JSON.stringify(d)}));return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()`);
const explain = (a, d) => a.run(`_explainDrv(calcDrvPension(getLifetimeSettings(),_drvEmClean(Object.assign(getDrv(),${JSON.stringify(d)}))))`);
const main = h => h.split('<details')[0];
const euros = h => (h.replace(/<[^>]+>/g, '').match(/\d[\d.]* €/g) || []);

test('1. ohne Erwerbsminderung: einfache Rechnung, keine Aufschlüsselung und keine Kennzeichnung', () => {
  const a = ctx(), d = { points: 30, salary: 30000 };
  const x = r(a, d);
  near(x.netto, (30 + 30000 / DE * (67 - NOW)) * RW * NET);
  assert.equal(x.em, undefined); assert.equal(x.basis, undefined);
  assert.doesNotMatch(line(a, d), /Modellrechnung|Berechnung|Untergrenze/);
  assert.doesNotMatch(explain(a, d), /Vereinfachte Prognose aus Beitragszeiten/);
  assert.equal(a.run(`_drvMinTxt(${JSON.stringify(x)})`), '');
});

test('2./5./8. teilweise EM, Zurechnungszeit > 0: Untergrenze höher als die Prognose aus Beitragszeiten', () => {
  const a = ctx(), d = { emType: 1, emTotal: 50, emZz: 20, emZf: 0.9 };
  const x = r(a, d);
  near(x.inp.points, 30, 1e-12);
  near(x.zfPts, 0.5 * 0.9 + 0.5 * 1);
  near(x.standalone, 30 * 0.95 * RW * NET);
  near(x.lowerBound, 50 * 0.9 * 1.0 * RW * NET);
  near(x.netto, x.lowerBound);
  assert.equal(x.basis, 'lowerBound');
  const ex = explain(a, d);
  assert.match(ex, /je zur Hälfte 0,9 der EM-Rente und 1 der Altersrente \(§ 77 Abs\. 3 Satz 2 SGB VI\)/);
  assert.match(ex, /Bereits erworben: <b>30<\/b> Entgeltpunkte \(50 laut Bescheid − 20 Zurechnungszeit/);
  assert.match(ex, /mit dem Rentenartfaktor 1,0 der Altersrente statt 0,5/);
  assert.match(ex, /Die rechnerische Untergrenze ist höher als die vereinfachte Prognose aus Beitragszeiten\. Deshalb wird sie für die weitere Finanzplanung verwendet\./);
});

test('3. volle EM: Zugangsfaktor der EM-Rente für alle bereits erworbenen Punkte, Rentenartfaktor ohne „statt 0,5“', () => {
  const a = ctx(), d = { emType: 2, emTotal: 50, emZz: 20, emZf: 0.9 };
  const x = r(a, d);
  near(x.zfPts, 0.9, 1e-12);
  near(x.standalone, 30 * 0.9 * RW * NET); near(x.lowerBound, 45 * RW * NET);
  assert.equal(x.basis, 'lowerBound');
  const ex = explain(a, d);
  assert.match(ex, /Zugangsfaktor: 0,9 der EM-Rente für die bereits erworbenen Punkte \(§ 77 Abs\. 3 Satz 1 SGB VI\)/);
  assert.doesNotMatch(ex, /statt 0,5/);
});

test('4./7. Prognose aus Beitragszeiten höher als die Untergrenze (Zurechnungszeit = 0, Arbeit bis 67)', () => {
  const a = ctx(), d = { emType: 1, emTotal: 40, emZz: 0, emZf: 0.892, salary: DE, emLimit: 60000 };
  const x = r(a, d);
  near(x.inp.points, 40, 1e-12, 'ohne Zurechnungszeit = alle Punkte laut Bescheid');
  near(x.standalone, (40 * 0.946 + (67 - NOW)) * RW * NET);
  near(x.lowerBound, 40 * 0.892 * RW * NET);
  near(x.netto, x.standalone);
  assert.equal(x.basis, 'standalone');
  assert.match(explain(a, d), /Die vereinfachte Prognose aus Beitragszeiten ist höher als die rechnerische Untergrenze\. Deshalb wird sie verwendet; die Untergrenze verändert das Ergebnis nicht\./);
});

test('6. beide Werte gleich: ausdrücklich als unabhängig gleiches Ergebnis, nicht als greifende Untergrenze', () => {
  const a = ctx(), d = { emType: 2, emTotal: 50, emZz: 0, emZf: 0.9 };
  const x = r(a, d);
  near(x.standalone, x.lowerBound, 1e-9);
  assert.equal(x.besitz, false); assert.equal(x.basis, 'equal');
  const ex = explain(a, d);
  assert.match(ex, /Beide Berechnungswege kommen unabhängig voneinander zum selben Betrag\. Die Untergrenze ist hier nicht maßgeblich/);
  assert.doesNotMatch(ex, /Deshalb wird sie für die weitere Finanzplanung verwendet/);
  // dein Beispiel aus der Rückmeldung: gleiche Beträge in der alten Anzeige, tatsächlich bestimmt die Untergrenze
  const b = ctx(50), y = r(b, { emType: 1, emTotal: 61.2256, emZz: 38, emZf: 0.892, em: 1019, salary: 37000 });
  assert.equal(y.basis, 'lowerBound');
  assert.ok(y.standalone < y.lowerBound - 500);
});

test('9. Zurechnungszeit = Gesamtpunkte: keine bereits erworbenen Punkte, nur zusätzliche', () => {
  const a = ctx(60), d = { emType: 1, emTotal: 30, emZz: 30, emZf: 0.892, salary: 25000 };
  const x = r(a, d);
  assert.equal(x.inp.points, 0);
  near(x.standalone, 25000 / DE * (60 - NOW) * 1 * RW * NET);
  near(x.lowerBound, 30 * 0.892 * RW * NET);
  assert.match(explain(a, d), /Bereits erworben: <b>0<\/b> Entgeltpunkte \(30 laut Bescheid − 30 Zurechnungszeit/);
});

test('10. keine Doppelzählung: Zurechnungszeit nur in der Untergrenze, verwendet wird der höhere Wert, nie die Summe', () => {
  const a = ctx();
  const base = { emType: 1, emTotal: 60, emZf: 0.892, salary: 30000 };
  const epNew = 30000 / DE * (67 - NOW);
  const xs = [0, 20, 45, 60].map(zz => ({ zz, x: r(a, { ...base, emZz: zz }) }));
  for (const { zz, x } of xs) {
    near(x.standalone, ((60 - zz) * 0.946 + epNew) * RW * NET, 1e-6);
    near(x.lowerBound, 60 * 0.892 * RW * NET, 1e-9, 'Untergrenze hängt nicht von der Zurechnungszeit ab');
    near(x.netto, Math.max(x.standalone, x.lowerBound), 1e-9);
    assert.ok(x.netto < x.standalone + x.lowerBound - 1, 'nicht addiert');
  }
  assert.ok(xs[0].x.standalone > xs[1].x.standalone, 'mehr Zurechnungszeit = weniger tatsächliche Punkte, kein Zuschlag');
});

test('11. Anzeige: Hauptzeile nur mit der verwendeten Prognose, Aufschlüsselung eingeklappt; Alter der zusätzlichen Punkte', () => {
  const a = ctx(60), d = { emType: 1, emTotal: 61.2256, emZz: 38, emZf: 0.892, salary: 37000 };
  const h = line(a, d), x = r(a, d);
  // Hauptzeile: die verwendete Altersrente; die Prognose aus Beitragszeiten erscheint dort nicht (daneben nur die laufende EM-Rente)
  const altersrente = main(h).split('<br>')[0];
  assert.deepEqual(euros(altersrente), [a.run(`fmt(${x.netto})`)]);
  assert.ok(!euros(main(h)).includes(a.run(`fmt(${x.standalone})`)));
  assert.match(h, /<details class="pv-calc-d"><summary>Berechnung<\/summary>/); assert.doesNotMatch(h, /<details[^>]*open/);
  const calc = h.slice(h.indexOf('<details'));
  const order = ['Vereinfachte Prognose aus Beitragszeiten', 'Rechnerische Untergrenze nach heutigem Rentenrecht', 'Verwendete Prognose'].map(t => calc.indexOf(t));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], order.join());
  assert.match(calc, /Zusätzlich <b>bis Alter 60<\/b> laut Lebensphasen: <b>[\d,]+<\/b> Entgeltpunkte/);
  assert.equal(x.ptsUntil, 60);
  // weitere Person: Alter in ihrem Alter
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'p1',name:'Kim',by:1985,until:58,salary:30000,emType:1,emTotal:40,emZz:10}]))");
  const k = a.run("(()=>{const p=getDrvExtra()[0];return _drvResultHTML(p,calcDrvExtra(getLifetimeSettings(),p),58);})()");
  assert.match(k, /bis Alter 58<\/b> laut Lebensphasen \(Alter von Kim\)/);
  // ohne Untergrenze (EM endet mehr als 24 Monate vorher)
  const n = explain(ctx(), { emType: 2, emTotal: 40, emZz: 10, emUntil: 2043 });
  assert.match(n, /Entfällt: Die EM-Rente endet mehr als 24 Monate vor der Altersrente/);
  assert.match(n, /Ohne rechnerische Untergrenze wird die vereinfachte Prognose aus Beitragszeiten verwendet/);
});

test('12. Kennzeichnung als Modellrechnung, Hinweis zur fehlenden Bewertung der EM-Bezugszeit, keine Garantie (DE und EN)', () => {
  const a = ctx(), d = { emType: 1, emTotal: 50, emZz: 20, emZf: 0.9 };
  const h = line(a, d), ex = explain(a, d);
  assert.match(main(h), /vereinfachte Modellrechnung/);
  for (const t of [h, ex]) {
    assert.match(t, /Ohne die rentenrechtliche Bewertung der Zeit des EM-Rentenbezugs \(Anrechnungszeit, § 58 Abs\. 1 Satz 1 Nr\. 5 SGB VI\)\. Der Betrag ist deshalb keine vollständige Altersrentenprognose\./);
    assert.match(t, /§ 77 Abs\. 3 und § 88 SGB VI sind hier vereinfacht modelliert/);
    assert.match(t, /kein garantierter künftiger Nettobetrag/);
    assert.match(t, /bezieht sich auf die persönlichen Entgeltpunkte, nicht auf einen garantierten künftigen Nettobetrag/);
    assert.doesNotMatch(t, /gesichert|Altersrente ohne Besitzschutz/);
  }
  assert.equal(a.run(`_drvMinTxt(${JSON.stringify(r(a, d))})`), ' · vereinfachte Modellrechnung');
  a.run("appStorage.setItem('appLang','en');_lang=_readLang();");
  const en = line(a, d) + explain(a, d);
  assert.match(en, /Simplified forecast from contribution periods/); assert.match(en, /is therefore not a complete old-age pension forecast/);
  assert.match(en, /modelled in a simplified way/); assert.match(en, /not a guaranteed future net amount/);
  assert.doesNotMatch(en, /Entgeltpunkte|Zurechnungszeit|Untergrenze|Modellrechnung|Beitragszeiten|netto/);
});
