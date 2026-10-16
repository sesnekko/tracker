/* 15.10.2026: Besitzschutz-Frist und individuelle Hinzuverdienstgrenze der Erwerbsminderungsrente (§ 88, § 96a SGB VI);
   Altersvorsorgedepot im Vorruhestand; Phasenbalken je Person und Infobox der Prognose. Erwartungen aus dem SGB VI und
   einfacher Arithmetik mit Rentenwert 42,52 € und 20 % Abzügen. Die Tests zur Zurechnungszeit, zum Zugangsfaktor und zum
   Übergang in die Altersrente stehen seit Schema 19 in em-old-age.test.cjs (Entgeltpunkte laut Bescheid statt
   getrennter Zurechnungszeit zusätzlich zu den Rentenpunkten). */
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
  assert.doesNotMatch(bar, />heute</, 'ohne „heute“ (15.10.2026)');
});

test('Infobox: begrenzte Höhe, Text scrollt, Tabelle in eigenem Rahmen; Hinweis auf die Annahmen (seit 16.10.2026 wieder auf der Daten-Seite)', () => {
  assert.match(html, /#infoPopup \.info-popup-text\{flex:1 1 auto;min-height:0;overflow-y:auto/);
  assert.match(html, /#infoPopup\.show\{display:flex;flex-direction:column;width:min\(520px,92vw\);max-height:min\(84vh,760px\)/);
  assert.match(html, /<div class="se-wrap"><table class="se-t">/);
  assert.match(html, /Ändern unter Daten → Prognose &amp; Annahmen → Rendite &amp; Sparrate je Asset\./);
});

test('Phasenbalken: der Rentenbeginn ist immer beschriftet; eine zu nahe Marke davor entfällt', () => {
  const a = ctx();
  // 46,75 bis 95: 60, 65 (Arbeitsende) und 67 (Rente) – 65 und 67 liegen zu dicht beieinander
  const own = a.run('_phaseBarHTML([46.75,60,65,67,95])');
  assert.match(own, />60</); assert.match(own, />67</); assert.doesNotMatch(own, />65</);
  assert.match(own, /class="last" style="left:100%">95</);
  // weitere Person, geboren 1977: Vollzeit bis 65, Rente ab 67 – die 67 steht, die 65 weicht
  a.run("appStorage.setItem('lt-drv-extra',JSON.stringify([{id:'p1',name:'Claudia',by:1977,until:65,points:20}]))");
  const bar = a.run('_personBarHTML(getLifetimeSettings(),getDrvExtra()[0],95)');
  assert.match(bar, />67</); assert.doesNotMatch(bar, />65</);
});

/* 15.10.2026: In der installierten iPhone-App sperrt lockBodyScroll jedes Wischen (touchmove + preventDefault). Der Text
   eines offenen Info-Fensters muss trotzdem scrollen, sonst ist z. B. die Erklärung der Erfolgschance nicht lesbar. */
test('Infobox: Wischen im langen Text bleibt erlaubt, außerhalb gesperrt', () => {
  const a = app(html);
  a.run(`globalThis.__mk=(box)=>{const e={prevented:false,preventDefault(){this.prevented=true;},target:{closest:s=>s==='.live-popup.show .info-popup-text'?box:null}};preventTouchMove(e);return e.prevented;};`);
  assert.equal(a.run('__mk({scrollHeight:900,clientHeight:400})'), false, 'langer Text: scrollt');
  assert.equal(a.run('__mk({scrollHeight:300,clientHeight:400})'), true, 'kurzer Text: Seite bleibt gesperrt');
  assert.equal(a.run('__mk(null)'), true, 'außerhalb des Textes gesperrt');
});
