/* 15.10.2026: Prognose → „Zeitverlauf“. Die Zeile steht in der Ergebnis-Karte unter „Ziel mit …“ und „Sicher
   möglich ab“ und wechselt in eine eigene Ansicht: statt Ergebnis, Phasen und Annahmen die Liste der Vermögen-Seite, je
   Gruppe Vermögenswert und Restschuld als eigene Zeilen; beim Fahren über den Chart Wert, Anteil und Veränderung zu heute
   im gewählten Alter (Historie aus den Monatsständen, Prognose aus dem Erwartungspfad, heutige Kaufkraft).
   „Zurück zur Prognose“ beendet die Ansicht. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');

// Zustand wie im Prognose-Chart (_ltState), ohne Historie: Alter = Prognosejahre
function withState() {
  const a = app(html); a.csv(demoCSV);
  a.run(`(()=>{const p=buildPlan();const det=simulatePlan(p,p.s.withdrawFrom,{record:true});
    const ages=Array.from({length:p.nSteps},(_,y)=>p.firstAge+y);
    globalThis.__S={plan:p,det,allAges:ages,currentAge:p.currentAge,infl:p.s.inflation/100,
      histGrossMaps:p.groups.map(()=>new Map()),histDebtMaps:p.groups.map(()=>new Map())};})()`);
  return a;
}

test('Simulation: Wert und Restschuld je Gruppe ergeben zusammen den Nettowert der Gruppe', () => {
  const a = withState();
  const r = a.json(`(()=>{const d=__S.det;let maxErr=0,debt=0,neg=0;
    d.per.forEach((arr,j)=>arr.forEach((v,y)=>{maxErr=Math.max(maxErr,Math.abs(d.perGross[j][y]-d.perDebt[j][y]-v));debt+=d.perDebt[j][y];if(d.perDebt[j][y]<0)neg++;}));
    return{maxErr,debt,neg,G:__S.plan.groups.length,len:d.perGross.length};})()`);
  assert.ok(r.maxErr < 1e-6, 'per = perGross − perDebt');
  assert.ok(r.debt > 0, 'Demo hat einen Kredit');
  assert.equal(r.neg, 0, 'Restschuld nie negativ');
  assert.equal(r.len, r.G);
  // ohne record keine Arrays (Monte-Carlo bleibt schlank)
  assert.equal(a.run('(()=>{const p=buildPlan();const d=simulatePlan(p,p.s.withdrawFrom);return d.perGross===null&&d.perDebt===null;})()'), true);
});

test('Zeilen: erst Vermögenswerte (brutto), dann Restschulden (negativ), je Block nach heutigem Wert sortiert', () => {
  const a = withState();
  const rows = a.json('_ltGroupRows(__S).map(r=>({name:r.name,liab:r.liab,now:r.now,key:r.key,kind:r.kind,icon:r.icon}))');
  const firstLiab = rows.findIndex(r => r.liab);
  assert.ok(firstLiab > 0, 'es gibt Vermögenswerte und Verbindlichkeiten');
  assert.ok(rows.slice(firstLiab).every(r => r.liab && r.now < 0), 'Verbindlichkeiten stehen am Ende und zählen negativ');
  const assets = rows.slice(0, firstLiab);
  assert.ok(assets.every(r => !r.liab && r.now >= 0));
  for (let i = 1; i < assets.length; i++) assert.ok(assets[i - 1].now >= assets[i].now, 'absteigend nach Wert');
  // Immobilie brutto (die Vermögen-Seite zeigt sie „nach Kredit“), Kredit mit eigenem Namen und Symbol
  const home = rows.find(r => r.key === 'Immobilien' && !r.liab), loan = rows.find(r => r.liab);
  assert.equal(home.now, a.run("buildPlan().groups.find(g=>g.key==='Immobilien').gross"));
  assert.equal(home.kind, 'illiquide', 'ohne „nach Kredit“');
  assert.equal(a.run("_v2GroupKind('Immobilien')"), 'illiquide · nach Kredit', 'Vermögen-Seite unverändert');
  assert.equal(loan.name, 'Kredit Wohnung', 'ein Kredit in der Gruppe: dessen Name');
  assert.equal(loan.kind, 'Restschuld');
  assert.match(loan.icon, /M3\.5 9 12 4\.5 20\.5 9/, 'Bank-Symbol wie Verbindlichkeiten');
  assert.equal(loan.now, -a.run("buildPlan().groups.find(g=>g.key==='Immobilien').debt"));
});

test('Werte je Alter: Prognose aus dem Erwartungspfad in heutiger Kaufkraft, Historie aus den Monatsständen', () => {
  const a = withState();
  const r = a.json(`(()=>{const S=__S,rows=_ltGroupRows(S),j=S.plan.groups.findIndex(g=>g.key==='Immobilien'),y=5,age=S.allAges[y];
    const defl=Math.pow(1+S.infl,age-S.currentAge);
    const home=rows.find(x=>x.key==='Immobilien'&&!x.liab),loan=rows.find(x=>x.liab);
    return{home:home.vals[y],homeExp:S.det.perGross[j][y]/defl,loan:loan.vals[y],loanExp:-S.det.perDebt[j][y]/defl,loanNow:loan.now};})()`);
  assert.ok(Math.abs(r.home - r.homeExp) < 1e-6);
  assert.ok(Math.abs(r.loan - r.loanExp) < 1e-6);
  assert.ok(r.loan > r.loanNow, 'Restschuld sinkt (Tilgung) → Beitrag zum Vermögen steigt');
  // Historie: erfasste Werte (nominal); in Kaufkraft mit dem genauen Alter des Monats umgerechnet wie der Chart
  const hist = a.json(`(()=>{const S=Object.assign({},__S),j=S.plan.groups.findIndex(g=>g.key==='Immobilien'),past=Math.floor(S.currentAge)-1;
    S.allAges=[past,...S.allAges];S.histAgeMap=new Map([[past,past+0.5]]);
    S.histGrossMaps=S.plan.groups.map((g,k)=>new Map(k===j?[[past,111]]:[]));S.histDebtMaps=S.plan.groups.map((g,k)=>new Map(k===j?[[past,222]]:[]));
    const rows=_ltGroupRows(S),h=rows.find(x=>x.key==='Immobilien'&&!x.liab),l=rows.find(x=>x.liab);
    return{n:[h.valsN[0],l.valsN[0]],r:[h.vals[0],l.vals[0]],f:Math.pow(1+S.infl,S.currentAge-past-0.5)};})()`);
  assert.deepEqual(hist.n, [111, -222], 'nominal = wie erfasst');
  assert.ok(Math.abs(hist.r[0] - 111 * hist.f) < 1e-9 && Math.abs(hist.r[1] + 222 * hist.f) < 1e-9, 'Kaufkraft: höher, je weiter zurück');
  // Zukunft nominal: Erwartungspfad ohne Abzinsung (Immobilie wächst mit ihrer Rendite)
  const fut = a.json(`(()=>{const S=__S,rows=_ltGroupRows(S),j=S.plan.groups.findIndex(g=>g.key==='Immobilien'),h=rows.find(x=>x.key==='Immobilien'&&!x.liab);return[h.valsN[10],S.det.perGross[j][10],h.vals[10]];})()`);
  assert.equal(fut[0], fut[1]);
  assert.ok(fut[0] > fut[2], 'nominal über Kaufkraft');
});

test('Anzeige je Stelle: Anteil an den Vermögenswerten, Veränderung gegenüber heute', () => {
  const a = withState();
  const r = a.json(`(()=>{const rows=_ltGroupRows(__S);return{rows:rows.map(x=>({liab:x.liab,now:x.now,v5:x.vals[5]})),today:_ltTlView(rows,null),at:_ltTlView(rows,5)};})()`);
  const assetIdx = r.rows.map((x, i) => x.liab ? -1 : i).filter(i => i >= 0);
  const sum = assetIdx.reduce((s, i) => s + parseInt(r.today[i].pct), 0);
  assert.ok(Math.abs(sum - 100) <= assetIdx.length, 'Anteile ergeben etwa 100 %');
  r.rows.forEach((x, i) => {
    assert.equal(r.today[i].v, x.now);
    assert.equal(r.today[i].delta, null, 'heute ohne Veränderung');
    assert.ok(Math.abs(r.at[i].delta - (x.v5 - x.now)) < 1e-6);
    if (x.liab) { assert.equal(r.today[i].pct, ''); assert.equal(r.at[i].pct, ''); }
  });
});

test('Liste wie auf der Vermögen-Seite, Kopf mit „Zurück zur Prognose“', () => {
  const a = withState();
  const h = a.run('_ltTimelineHTML(_ltGroupRows(__S))');
  assert.match(h, /<span class="v2-ret-title">Zeitverlauf<small class="lt-tl-age" id="lt-tl-age">heute<\/small><\/span>/);
  assert.match(h, /<button type="button" class="v2-lp-btn lt-tl-exit" onclick="ltTimeline\(false\)">.*Zurück zur Prognose<\/button>/);
  assert.match(h, /<ul class="legend-list" id="ltLegend">/);
  assert.equal((h.match(/<li class="legend-row/g) || []).length, a.run('_ltGroupRows(__S).length'));
  // gleiche Zeile wie _createLegendRow: Symbol, Name, Anteil · Art, Wert, Veränderung
  assert.match(h, /<li class="legend-row" data-tl="0"><span class="v2-ico"><svg[^]*?<\/svg><\/span><div class="v2-row-l"><span class="legend-name">Immobilien<\/span><span class="v2-sub"><span class="legend-pct">\d+ %<\/span><span class="v2-kind">illiquide<\/span><\/span><\/div><div class="v2-row-r"><span class="legend-val">315\.000 €<\/span><span class="legend-delta"><\/span><\/div><\/li>/);
  assert.match(h, /<li class="legend-row lt-tl-liab" data-tl="\d+">.*?Kredit Wohnung.*?<span class="legend-pct"><\/span><span class="v2-kind">Restschuld<\/span>.*?<span class="legend-val neg">−202\.000 €<\/span>/);
  assert.match(h, /<div class="ds-seg lt-tl-unit" role="group" aria-label="Einheit"><button type="button" data-tl-unit="n" class="on" aria-pressed="true">Nominal<\/button><button type="button" data-tl-unit="r" class="" aria-pressed="false">Kaufkraft<\/button><\/div><ul class="legend-list" id="ltLegend">/, 'Start nominal');
  assert.match(h, /<p class="lt-tl-note" id="lt-tl-note">.*Nominal: Vergangenheit wie erfasst, Zukunft in Euro des jeweiligen Jahres.*Chart und Gesamtwert oben zeigen heutige Kaufkraft\.<\/p>$/);
  assert.match(a.run('_ltTimelineHTML([])'), /v2-empty/);
});

test('Ergebnis-Karte: Zeile „Zeitverlauf“ unter „Ziel mit …“ und „Sicher möglich ab“', () => {
  const a = withState();
  a.run(`(()=>{const p=__S.plan,R=p.s.withdrawFrom,mc=runMonteCarlo(p,R,true);
    _v2LtSummary({s:p.s,plan:p,mc,tc:targetCapital(p,R,__S.det),retireAge:findRetireAge(p),availAtR:mc.avail50[0],coverage:0.5,R,currentAge:p.currentAge});})()`);
  const h = a.el('v2-lt-summary').innerHTML;
  const i1 = h.indexOf('data-info="v2-milestone"'), i2 = h.indexOf('Sicher möglich ab'), i3 = h.indexOf('class="v2-lt-link v2-tl-row"');
  assert.ok(i1 > 0 && i1 < i2 && i2 < i3, 'Reihenfolge: beide Kennzahlen, dann die Zeile');
  assert.match(h, /<\/div><button type="button" class="v2-lt-link v2-tl-row" onclick="ltTimeline\(true\)"><span class="ps-open-i v2-lt-ico" aria-hidden="true"><svg[^]*?<\/svg><\/span><span class="t">Zeitverlauf<small>Anlagen und Kredite über die Jahre<\/small><\/span><span class="v2-chev" aria-hidden="true"><\/span><\/button><\/div>$/);
  assert.doesNotMatch(h, /v2-tl-tile/);
  // breite Karte (iPad, schmales Mac-Fenster): oben rechts unter „Abgesichert“, neben der Erfolgschance
  assert.match(h, /^<div class="v2-ret-in"><div class="v2-ret-head">/);
  assert.match(html, /\.v2-ret\{container-type:inline-size\}\n@container \(min-width:560px\)\{/);
  assert.match(html, /\.v2-ret-in>\.v2-ret-main\{grid-column:1;grid-row:2\}\n  \.v2-ret-in>\.v2-lt-link\.v2-tl-row\{grid-column:2;grid-row:2;/);
});

test('Ansicht wechseln: Liste ein, Ergebnis aus; zurück stellt die Prognose wieder her', () => {
  const a = withState();
  a.run("haptic=()=>{};globalThis.__cls={};document.getElementById('page-lifetime').classList.toggle=(c,on)=>{__cls[c]=on;}");
  a.run('_ltState=__S;ltTimeline(true)');
  assert.equal(a.json('__cls')['lt-tl-on'], true);
  assert.match(a.el('lt-timeline').innerHTML, /id="ltLegend"/);
  assert.equal(a.run('_ltTl.rows.length'), a.run('_ltGroupRows(__S).length'));
  // neue Daten (z. B. Annahme geändert) bauen die offene Liste neu
  a.run("_ltTimelineRender()");
  assert.match(a.el('lt-timeline').innerHTML, /id="ltLegend"/);
  a.run('ltTimeline(false)');
  assert.equal(a.json('__cls')['lt-tl-on'], false);
  assert.equal(a.el('lt-timeline').innerHTML, '');
  assert.equal(a.run('_ltTl'), null);
  // ohne Prognose (keine Vermögenswerte) keine Ansicht, auch wenn sie offen war
  a.run('ltTimeline(true);_ltState=null;_ltTimelineRender()');
  assert.equal(a.json('__cls')['lt-tl-on'], false);
});

test('Markup und Darstellung: Platz in der rechten Spalte, Fahren über den Chart, Liste im Stil der Vermögen-Seite', () => {
  assert.match(html, /<div class="desk-rail">\n<div class="lt-tl" id="lt-timeline"><\/div>/);
  assert.doesNotMatch(html, /ltListToggleBtn|lt-groups/, 'kein Knopf in der Chart-Leiste mehr');
  assert.match(html, /#page-lifetime\.lt-tl-on \.desk-rail>:not\(\.lt-tl\)\{display:none!important\}/);
  assert.match(html, /#legendAssets \.legend-row,#legendAssets-ipad \.legend-row,#ltLegend \.legend-row\{/);
  assert.match(html, /_ltTimelineAt\(idx\);\n    showCross\(idx\);/, 'Fahren über den Chart aktualisiert die Liste');
  assert.match(html, /_ltTimelineAt\(null\);\n  \}\n  let active=false;/, 'Loslassen zeigt wieder heute');
  // Asset-Flächen auf der Log-Skala mindestens 1.000 € (eine 0 zeichnete eine Diagonale über den ganzen Chart)
  assert.match(html, /const clip=v=>Math\.round\(ltUseLog\?Math\.max\(1000,v\):v\);/);
});

test('Sortierung beim Fahren: nach Größe im gewählten Alter, erst Vermögenswerte, dann Restschulden', () => {
  const a = withState();
  const rows = '[{liab:false},{liab:false},{liab:false},{liab:true},{liab:true}]';
  assert.deepEqual(a.json(`_ltTlOrder(${rows},[{v:100},{v:300},{v:200},{v:-50},{v:-400}])`), [1, 2, 0, 4, 3]);
  assert.deepEqual(a.json(`_ltTlOrder(${rows},[{v:100},{v:100},{v:null},{v:-50},{v:-50}])`), [0, 1, 2, 3, 4], 'gleich groß: Reihenfolge bleibt');
  // heute entspricht der Startreihenfolge der Liste
  assert.deepEqual(a.json('(()=>{const r=_ltGroupRows(__S);return _ltTlOrder(r,_ltTlView(r,null));})()'), a.json('_ltGroupRows(__S).map((x,i)=>i)'));
  assert.match(html, /_ltTlSort\(box\.querySelector\('#ltLegend'\),M\.rows,view\);/);
});

test('Einheit umschalten: nominal und Kaufkraft je Alter, Hinweis passt sich an', () => {
  const a = withState();
  const r = a.json(`(()=>{const rows=_ltGroupRows(__S),i=rows.findIndex(x=>x.key==='Immobilien'&&!x.liab);return{n:_ltTlView(rows,10,true)[i].v,r:_ltTlView(rows,10,false)[i].v,today:[_ltTlView(rows,null,true)[i].v,_ltTlView(rows,null,false)[i].v],now:rows[i].now,valsN:rows[i].valsN[10],vals:rows[i].vals[10]};})()`);
  assert.equal(r.n, r.valsN); assert.equal(r.r, r.vals);
  assert.deepEqual(r.today, [r.now, r.now], 'heute in beiden Einheiten gleich');
  a.run("haptic=()=>{};globalThis.__cls={};document.getElementById('page-lifetime').classList.toggle=(c,on)=>{__cls[c]=on;};_ltState=__S;ltTlNominal=true;ltTimeline(true)");
  a.run('ltTlUnit(false)');
  assert.equal(a.run('ltTlNominal'), false);
  assert.match(a.el('lt-tl-note').textContent, /Kaufkraft: alle Werte in heutigen Euro, wie Chart und Gesamtwert oben/);
  a.run('ltTlUnit(true)');
  assert.match(a.el('lt-tl-note').textContent, /^Fahr über den Chart: .*Nominal: Vergangenheit wie erfasst/);
  assert.match(html, /box\.onclick=e=>\{const b=e\.target\.closest&&e\.target\.closest\('\[data-tl-unit\]'\);if\(b\)ltTlUnit\(b\.dataset\.tlUnit==='n'\);\};/);
  assert.match(html, /_ltTlView\(M\.rows,age==null\?null:idx,ltTlNominal\)/, 'Fahren über den Chart nutzt die gewählte Einheit');
  assert.match(html, /histGrossMaps\[j\]\.set\(ia,q\.add\);histDebtMaps\[j\]\.set\(ia,q\.sub\);/, 'Historie nominal gespeichert');
});
