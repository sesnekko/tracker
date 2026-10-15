/* 15.10.2026: Etappenziel in der Ergebnis-Karte der Prognose (ersetzt „Verfügbar mit …“). Liquides Vermögen, das zu
   Beginn von „Weiterarbeiten“ (ohne diese Phase: zum Ruhestand) mindestens da sein sollte, damit der Rest des Plans das
   Sicherheitsniveau hält. Gesucht wird der größte einmalige Betrag, den man dann aus dem liquiden Vermögen nehmen könnte
   (mit denselben Marktverläufen wie die Erfolgschance); Ziel = erwartetes liquides Vermögen minus dieser Puffer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'i18n-en.js'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');

function demo() { const a = app(html); a.csv(demoCSV); return a; }
// Plan mit geänderten Annahmen, Monte-Carlo, Etappenziel und Grenzprüfung (Puffer besteht, Puffer + Toleranz nicht)
function scenario(a, over) {
  return a.json(`(()=>{const s=_ltPhases(Object.assign({},getLifetimeSettings(),${JSON.stringify(over)}));
    const p=buildPlan(s),R=s.withdrawFrom,lvl=s.safety/100,mc=runMonteCarlo(p,R,true),ms=_milestoneCalc(p,mc);
    const tol=Math.max(1000,0.01*Math.max(ms.projected,ms.today)),k=_kAt(p,ms.age);
    const at=ms.reachable?[_mcPass(_msPlan(p,k,ms.buffer),R,lvl),_mcPass(_msPlan(p,k,ms.buffer+tol+1),R,lvl)]:null;
    return{success:mc.success,level:lvl,ms,at,tol,p2:s.phase2From,workEnd:s.workEnd};})()`);
}

test('Alter: Beginn Weiterarbeiten, ohne diese Phase Ruhestand, danach heute', () => {
  const a = demo();
  assert.deepEqual(a.json('_msAge({s:{phase2From:50,workEnd:60},currentAge:41.75})'), { age: 50, phase: 2 });
  assert.deepEqual(a.json('_msAge({s:{phase2From:60,workEnd:60},currentAge:41.75})'), { age: 60, phase: 3 }, 'Weiterarbeiten entfällt');
  assert.deepEqual(a.json('_msAge({s:{phase2From:50,workEnd:60},currentAge:52})'), { age: 60, phase: 3 }, 'schon in Phase 2');
  assert.deepEqual(a.json('_msAge({s:{phase2From:50,workEnd:60},currentAge:63})'), { age: 63, phase: 0 }, 'schon im Ruhestand');
});

test('Puffer: Plan trägt → Ziel unter der Prognose, Grenze genau getroffen', () => {
  const a = demo();
  const r = scenario(a, { saveUntil: 50, monthlyWithdraw: 1200, pensionSpending: 1200 });
  assert.ok(r.success >= r.level, 'Ausgangsplan erreicht das Sicherheitsniveau');
  assert.equal(r.ms.age, 50); assert.equal(r.ms.phase, 2);
  assert.ok(r.ms.buffer > 0 && r.ms.short === 0);
  assert.ok(Math.abs(r.ms.need - Math.max(0, r.ms.projected - r.ms.buffer)) < 1e-6);
  assert.deepEqual(r.at, [true, false], 'mit dem Puffer noch ≥ Niveau, mit etwas mehr nicht');
});

test('Fehlbetrag: Plan trägt nicht → Ziel über der Prognose, „es fehlen“', () => {
  const a = demo();
  const r = scenario(a, { saveUntil: 50 });
  assert.ok(r.success < r.level);
  assert.ok(r.ms.buffer < 0);
  assert.ok(Math.abs(r.ms.short + r.ms.buffer) < 1e-6, 'es fehlen = nötiger Zuschuss');
  assert.ok(r.ms.need > r.ms.projected);
  assert.deepEqual(r.at, [true, false], 'mit dem Zuschuss ≥ Niveau, mit etwas weniger nicht');
});

test('Nicht erreichbar: ein Polster allein reicht nicht', () => {
  const a = demo();
  const r = scenario(a, { monthlyWithdraw: 60000, pensionSpending: 60000 });
  assert.equal(r.ms.reachable, false);
  assert.match(a.run(`_msTileHTML({s:{phase2From:60,workEnd:62},currentAge:41.75},{reachable:false})`), /<span class="n">—<\/span><span class="s">Ein Polster allein reicht nicht<\/span>/);
});

test('Entnahme bzw. Einzahlung im Etappenalter, Ausgangsplan bleibt unverändert', () => {
  const a = demo();
  const r = a.json(`(()=>{const p=buildPlan(),R=p.s.withdrawFrom,{age}=_msAge(p),k=_kAt(p,age),y=Math.round(age)-p.firstAge+1,n0=p.events.length;
    const base=simulatePlan(p,R,{record:true}).avail[y],sc=p._sched,minus=simulatePlan(_msPlan(p,k,50000),R,{record:true}).avail[y],plus=simulatePlan(_msPlan(p,k,-50000),R,{record:true}).avail[y];
    return{base,minus,plus,same:p.events.length===n0&&p._sched===sc};})()`);
  assert.ok(r.minus < r.base - 40000, 'Entnahme senkt das liquide Vermögen');
  assert.ok(r.plus > r.base + 40000, 'Einzahlung erhöht es');
  assert.equal(r.same, true);
});

test('Kachel: wird berechnet, Ziel mit Fortschritt, Fehlbetrag, kein Polster nötig', () => {
  const a = demo();
  const P = '{s:{phase2From:50,workEnd:60},currentAge:41.75}';
  assert.match(a.run(`_msTileHTML(${P},undefined)`), /^<div data-info="v2-milestone"><span class="k">Ziel mit 50 · liquide<\/span><span class="n">…<\/span><span class="s">wird berechnet<\/span><\/div>$/);
  const ok = a.run(`_msTileHTML(${P},{reachable:true,age:50,phase:2,today:100000,projected:400000,buffer:150000,need:250000,short:0})`);
  assert.match(ok, /<span class="n">250 Tsd\. €<\/span><span class="v2-mini"><i style="width:40\.0%"><\/i><\/span><span class="s">heute 100 Tsd\. € · 40 %<\/span><span class="s">erwartet 400 Tsd\. €<\/span>/);
  const short = a.run(`_msTileHTML(${P},{reachable:true,age:50,phase:2,today:100000,projected:200000,buffer:-30000,need:230000,short:30000})`);
  assert.match(short, /<span class="s"><span class="v2-ms-short">es fehlen ≈ 30 Tsd\. €<\/span><\/span>/);
  const none = a.run(`_msTileHTML(${P},{reachable:true,age:50,phase:2,today:100000,projected:200000,buffer:200000,need:0,short:0})`);
  assert.match(none, /<span class="n">0 €<\/span><span class="v2-mini"><i style="width:100\.0%"><\/i><\/span><span class="s">kein Polster nötig<\/span>/);
  assert.match(a.run(`_msTileHTML({s:{phase2From:50,workEnd:60},currentAge:63},undefined)`), /Nötig heute · liquide/);
});

test('Ergebnis-Karte: Etappenziel statt „Verfügbar mit …“, Hintergrundrechnung zeichnet neu', () => {
  const a = demo();
  a.run(`globalThis.__q=[];setTimeout=(f)=>{__q.push(f);return __q.length;};clearTimeout=()=>{};
    (()=>{const p=buildPlan(),R=p.s.withdrawFrom,mc=runMonteCarlo(p,R,true);
      _ltCalcCache={key:'t',mc};_ltState={plan:p,summary:{s:p.s,plan:p,mc,tc:{target:0},retireAge:null,availAtR:0,coverage:0,R,currentAge:p.currentAge}};
      _v2LtSummary(Object.assign({},_ltState.summary,{ms:_ltCalcCache.ms}));})()`);
  let h = a.el('v2-lt-summary').innerHTML;
  assert.doesNotMatch(h, /Verfügbar mit|nötig:/);
  assert.ok(h.indexOf('data-info="v2-milestone"') < h.indexOf('Sicher möglich ab'));
  assert.match(h, /wird berechnet/);
  a.run('_msSchedule();let n=0;while(__q.length&&n<100){__q.shift()();n++;}');
  assert.equal(a.run('_ltCalcCache.ms.reachable'), true);
  h = a.el('v2-lt-summary').innerHTML;
  assert.doesNotMatch(h, /wird berechnet/);
  assert.match(h, /Ziel mit \d+ · liquide<\/span><span class="n">[\d,.]+ (Tsd\. |Mio )?€<\/span>/);
  // neuer Stand während der Rechnung: altes Ergebnis wird verworfen
  a.run(`(()=>{const old={key:'a',mc:_ltCalcCache.mc};_ltCalcCache=old;_msSchedule();__q.shift()();_ltCalcCache={key:'b',mc:old.mc};while(__q.length)__q.shift()();globalThis.__old=old;})()`);
  assert.equal(a.run('__old.ms'), undefined);
});

test('Info-Text auf Deutsch und Englisch', () => {
  assert.match(html, /'v2-milestone':\['Etappenziel','<p>Liquides Vermögen, das zu Beginn der nächsten Lebensphase/);
  assert.match(i18n, /'v2-milestone': \['Milestone', '<p>Liquid wealth/);
});
