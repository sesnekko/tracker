/* 15.10.2026, Rückmeldung aus dem Test mit zwei Personen:
   1. „Planen bis Alter“ gilt für jede Person in ihrem eigenen Alter. Die Prognose läuft, bis die jüngste Person es erreicht hat;
      Renten laufen bis zum Ende (Entscheidung: keine Kürzung beim Planalter einer älteren Person).
   2. Eine Einnahme „EM-Rente …“ einer Person ist kein Gehalt: keine Arbeitszeit, keine Änderung mit den Lebensphasen.
   3. Der Balken einer weiteren Person zeigt die Lebensphasen (Ansparen in Phase 1 auch bei Teilzeit), nicht die Arbeitszeit.
   Harness Oktober 2026; du geboren Januar 1980 (46,75), Planalter 95. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
function ctx(people) {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-plan-horizon','95');appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  a.run(`appStorage.setItem('lt-drv-extra',${JSON.stringify(JSON.stringify(people))})`);
  return a;
}

test('1. Planalter für alle: eine jüngere Person verlängert die Prognose, eine ältere nicht; Beschriftung nennt sie', () => {
  const young = ctx([{ id: 'p1', name: 'Kim', by: 1985, points: 10 }]);
  assert.equal(young.run('buildPlan().horizonAge'), 100, '95 + 5 Jahre Abstand');
  assert.deepEqual(young.json('buildPlan().horizonWho'), { name: 'Kim', age: 95 });
  assert.equal(young.run('_horizonTxt(buildPlan())'), '100 (Kim 95)');
  const old = ctx([{ id: 'p1', name: 'Mia', by: 1975, points: 10 }]);
  assert.equal(old.run('buildPlan().horizonAge'), 95);
  assert.equal(old.json('buildPlan().horizonWho'), null);
  // Renten der älteren Person laufen bis zum Ende der Prognose (kein Ende bei ihrem Planalter)
  const pens = old.json("buildPlan().pensions.filter(x=>x.drv&&x.kind!=='em')");
  assert.ok(pens.length >= 1 && pens.every(x => x.until == null || x.until >= 95), JSON.stringify(pens));
});

/* Rückmeldung 15.10.2026: Balken gleich lang, alle enden rechts beim Planalter; eine ältere Person beginnt mit einem
   ausgegrauten Stück so lang wie der Altersabstand (vorher: kürzerer Balken auf der Kalender-Zeitachse) */
const flexes = h => [...h.matchAll(/<i class="(lp-[a-z0-9]+)" style="flex:([\d.]+)"/g)].map(m => [m[1], +m[2]]);
const total = h => flexes(h).reduce((x, [, f]) => x + f, 0);
test('1. Balken: gleich lang, alle enden beim Planalter; die ältere Person beginnt ausgegraut', () => {
  const old = ctx([{ id: 'p1', name: 'Mia', by: 1975, points: 10 }]);
  const s = 'getLifetimeSettings()';
  const mia = old.run(`_personBarHTML(${s},getDrvExtra()[0],buildPlan().horizonAge)`);
  const me = old.run(`(()=>{const s=${s},p=buildPlan();return _ownBarHTML(_phaseBounds(s,_curAgeOf(s),p.horizonAge),s,_curAgeOf(s)-_youngestNow(s,getDrvExtra()));})()`);
  assert.deepEqual(flexes(mia)[0], ['lp-past', 5], 'fünf Jahre älter: fünf Jahre ausgegraut');
  assert.equal(flexes(me)[0][0] === 'lp-past', false, 'du bist die jüngste Person');
  assert.ok(Math.abs(total(mia) - total(me)) < 0.01, total(mia) + ' ≠ ' + total(me));
  assert.match(mia, /<span class="last" style="left:100%">95<\/span>/); assert.match(me, /<span class="last" style="left:100%">95<\/span>/);
  assert.match(mia, /<span class="first" style="left:10\.36%">heute<\/span>/, '„heute“ nach dem ausgegrauten Stück');
  assert.doesNotMatch(mia + me, /lp-part/);
  // jüngere Person: die Prognose läuft länger, dein Balken beginnt ausgegraut und endet bei deinen 95
  const young = ctx([{ id: 'p1', name: 'Kim', by: 1985, points: 10 }]);
  const me2 = young.run(`(()=>{const s=${s},p=buildPlan();return _ownBarHTML(_phaseBounds(s,_curAgeOf(s),p.horizonAge),s,_curAgeOf(s)-_youngestNow(s,getDrvExtra()));})()`);
  const kim = young.run(`_personBarHTML(${s},getDrvExtra()[0],buildPlan().horizonAge)`);
  assert.deepEqual(flexes(me2)[0], ['lp-past', 5]);
  assert.ok(Math.abs(total(me2) - total(kim)) < 0.01);
  assert.match(me2, /left:100%">95</); assert.match(kim, /left:100%">95</);
});

test('2. EM-Rente im Budget ist kein Gehalt: keine Arbeitszeit, nicht in den Lebensphasen geändert', () => {
  const a = ctx([{ id: 'p1', name: 'Miriam', by: 1987, emType: 1, emTotal: 40, emZz: 15, em: 1019 }]);
  a.run(`{const bd=loadBudgetData();bd.einkommen.push({id:'m1',name:'Nettogehalt Miriam',kind:'income',person:'p1',workPct:45,values:Array(12).fill(1848),targetGroupId:null,subcat:''});
    bd.einkommen.push({id:'m2',name:'EM-Rente Miriam',kind:'income',person:'p1',workPct:45,values:Array(12).fill(1019),targetGroupId:null,subcat:''});saveBudgetData(bd);}`);
  assert.equal(a.run("_budgetWorkShare('p1')"), 0.45, 'nur das Gehalt zählt zur Arbeitszeit (vorher 90 %)');
  assert.equal(a.run("_personSalary('p1')"), 1848);
  assert.equal(a.run("calcDrvExtra(getLifetimeSettings(),getDrvExtra()[0]).net"), 1848, 'Gehalt in der Prognose ohne EM-Rente');
  for (const n of ['EM-Rente', 'EM Rente Miriam', 'Erwerbsminderungsrente', 'EMR']) assert.equal(a.run(`_isEmName(${JSON.stringify(n)})`), true, n);
  assert.equal(a.run("_isEmName('Gehalt Emil')"), false);
  // Budget-Sheet: keine Arbeitszeit, Hinweis auf die EM-Rente; gespeichert ohne Arbeitszeit
  a.run("openBudgetSheet({ref:'einkommen:m2'})");
  assert.match(a.run("document.getElementById('dsBody').innerHTML"), /id="b-emRow"/);
});

test('3. Phasenbalken einer weiteren Person: Ansparen in Phase 1 auch bei Teilzeit, dann Weiterarbeiten, ohne Arbeit, Rente', () => {
  const a = ctx([{ id: 'p1', name: 'Miriam', by: 1980, until: 60, w1: 90, w2: 50, points: 20 }]);
  a.run("appStorage.setItem('lt-save-until','50');appStorage.setItem('lt-withdraw-from','62');");
  const bar = a.run("_personBarHTML(getLifetimeSettings(),getDrvExtra()[0],95)");
  const cls = [...bar.matchAll(/<i class="(lp-p\d)"/g)].map(m => m[1]);
  assert.deepEqual(cls, ['lp-p1', 'lp-p2', 'lp-p3', 'lp-p4'], 'vorher: lp-p2 ab heute (Teilzeit 90 %)');
  assert.match(bar, />60</, 'Arbeitsende'); assert.match(bar, />67</, 'Rentenbeginn'); // 50 liegt zu nah an „heute“ und entfällt
});
