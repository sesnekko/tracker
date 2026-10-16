/* 16.10.2026: Partner-Story bunter und einfacher für Menschen ohne Finanzinteresse. Je Story ein Bild (Emoji), eine
   kurze Erklärung, ab und zu ein Witz; neu „Der Trick mit dem Zinseszins“ (Rendite der entnehmbaren Anlagen nach
   Inflation bis zum Arbeitsende) und „Unsere Einschätzung“ (Stufe aus Erfolgschance und Sicherheitsziel, Tacho, bis zu
   drei Punkte, Hinweis „Keine Anlageberatung“). Sparquote und Notgroschen rechnen wie Budget- und Vermögens-Seite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('./app-harness.cjs');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');

function demo() {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  // Die Seite selbst braucht das echte DOM; die Story liest nur den Rechenstand
  a.run('(()=>{const p=buildPlan();_ltState={plan:p,mc:runMonteCarlo(p,p.s.withdrawFrom,true),infl:p.s.inflation/100,currentAge:p.currentAge};_ltCalcCache={retireAge:findRetireAge(p)};})()');
  return a;
}
const strip = t => String(t).replace(/<[^>]+>/g, '').replace(/ /g, ' ');

test('Folgen: Zinseszins und Einschätzung neu, Bilder und Witze, längere Dauer für die vollen Stories', () => {
  const a = demo();
  const sl = a.json('_psSlides().map(x=>({k:x.kicker,emo:x.emo||"",joke:x.joke||"",dur:x.dur||0,big:x.big,viz:x.viz||""}))');
  const kick = sl.map(x => x.k);
  assert.equal(kick[0], 'Partner-Story');
  assert.ok(kick.indexOf('Der Trick mit dem Zinseszins') > kick.indexOf('Heute'));
  assert.equal(kick.at(-2), 'Unsere Einschätzung');
  assert.equal(kick.at(-1), 'Kurz gesagt');
  assert.ok(sl.slice(1).filter(x => x.k !== 'Unsere Einschätzung').every(x => x.emo), 'jede Story außer Start und Einschätzung mit Bild');
  assert.ok(sl.filter(x => x.joke).length >= 8, 'ab und zu ein Witz');
  assert.equal(sl.find(x => x.k === 'Der Trick mit dem Zinseszins').dur, 9000);
  assert.equal(sl.find(x => x.k === 'Unsere Einschätzung').dur, 12000);
  assert.match(sl[1].joke, /^Das sind rund [\d.]+ Kugeln Eis 🍦/);
  assert.match(html, /cur\.style\.animationDuration=_ps\.dur\[i\]\+'ms';/);
});

test('Zinseszins: Faktor aus der Rendite nach Inflation bis zum Jahr des Arbeitsendes', () => {
  const a = demo();
  const r = a.json(`(()=>{const d=_psData(),s=_psSlides().find(x=>x.kicker==='Der Trick mit dem Zinseszins');
    const y1=d.yearAt(d.b[2]),ny=y1-new Date().getFullYear();return{r:d.rReal,ny,y1,big:s.big,text:s.text,viz:s.viz};})()`);
  assert.ok(r.r > 0.005 && r.r < 0.1, 'Rendite nach Inflation ' + r.r);
  const F = Math.pow(1 + r.r, r.ny).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.equal(strip(r.big), `1 € → ${F} €`);
  assert.match(strip(r.text), new RegExp(`wird aus 1 € bis ${r.y1} etwa ${F.replace('.', '\\.')} €`));
  assert.equal((r.viz.match(/<small>/g) || []).length, 4, 'vier Schneebälle');
  assert.match(r.viz, new RegExp(`<small>${r.y1}</small></div></div>$`), 'letzter Ball im Jahr des Arbeitsendes');
  // ohne spürbare Rendite oder kurz vor dem Arbeitsende entfällt die Story
  a.run("getAssetParam=(ap,k,f,c)=>({ret:0,vol:0,saving:0,retDyn:0,volDyn:0,tax:0,avail:0})[f]??0;(()=>{const p=buildPlan();_ltState={plan:p,mc:runMonteCarlo(p,p.s.withdrawFrom,true),infl:p.s.inflation/100,currentAge:p.currentAge};})()");
  assert.ok(!a.json('_psSlides().map(x=>x.kicker)').includes('Der Trick mit dem Zinseszins'));
});

test('Einschätzung: Stufen aus Erfolgschance und Ziel', () => {
  const a = demo();
  const v = (p, t) => a.run(`_psVerdict(${p},${t})`);
  assert.equal(v(96, 85), 0); assert.equal(v(93, 85), 0); assert.equal(v(92, 85), 1); assert.equal(v(85, 85), 1);
  assert.equal(v(70, 85), 2); assert.equal(v(69, 85), 3);
  assert.equal(v(98, 95), 0, 'höchstens 98 nötig'); assert.equal(v(96, 95), 1);
  const g = a.run('_psGauge(89,85)');
  assert.match(g, /stroke-dasharray:89 100/); assert.match(g, /<text x="100" y="90">89 %<\/text>/);
});

test('Einschätzung: Tacho, Punkte wie Budget- und Vermögens-Seite, Hinweis keine Anlageberatung', () => {
  const a = demo();
  const r = a.json(`(()=>{const d=_psData(),s=_psSlides().find(x=>x.kicker==='Unsere Einschätzung'),bd=loadBudgetData(),q=_budgetQuotes(bd);
    const e=d.plan.data[d.plan.latestKey],cash=_vf().filter(f=>f.category==='cash').reduce((x,f)=>x+(+((e._details||{})[f.id])||0),0);
    return{pct:d.pct,tgt:Math.round(d.s.safety),big:s.big,viz:s.viz,rate:q.savings,mo:cash/_avgBudget(bd,'ausgaben'),R:d.s.withdrawFrom,retire:d.retireAge};})()`);
  const tiers = ['Sehr entspannt', 'Auf Kurs', 'Knapp dran', 'Da geht noch was'];
  assert.ok(strip(r.big).startsWith(tiers[a.run(`_psVerdict(${r.pct},${r.tgt})`)]));
  assert.match(r.viz, new RegExp(`stroke-dasharray:${r.pct} 100`));
  assert.match(r.viz, new RegExp(`Ziel ${r.tgt} %`));
  const tips = [...r.viz.matchAll(/<li class="(ok|todo)"><i aria-hidden="true">(✓|→)<\/i><span>([^<]+)<\/span><\/li>/g)].map(m => [m[1], m[3]]);
  assert.ok(tips.length >= 2 && tips.length <= 3, tips.join(' | '));
  assert.match(tips[0][1], /^(Aufhören mit|Sicher klappt das Aufhören ab|Bis \d+ gibt es kein sicheres Alter)/);
  const q = Math.round(r.rate * 100);
  assert.ok(tips.some(t => t[1].startsWith(`Sparquote ${q} %`)), 'Sparquote wie auf der Budget-Seite');
  const mo = r.mo >= 10 ? Math.round(r.mo).toLocaleString('de-DE') : (Math.round(r.mo * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1 });
  if (tips.length === 3) assert.ok(tips[2][1].startsWith(`Notgroschen: ${mo} Monatsausgaben`), tips[2][1]);
  assert.match(r.viz, /<p class="ps-fine">Keine Anlageberatung – nur eine Rechnung mit euren Zahlen\.<\/p>/);
});

test('Sparen: Sparquote = (Einnahmen − Ausgaben) ÷ Einnahmen wie auf der Budget-Seite', () => {
  const a = demo();
  const r = a.json(`(()=>{const d=_psData(),q=_budgetQuotes(loadBudgetData()),s=_psSlides().find(x=>x.kicker==='Jeden Monat');return{save:d.save,rate:d.rate,q,text:s.text,big:s.big};})()`);
  assert.ok(Math.abs(r.rate - r.q.savings) < 1e-9);
  assert.ok(Math.abs(r.save - r.q.saveAvg) < 1e-6);
  assert.match(r.big, new RegExp(`data-ps-count="${Math.round(r.q.saveAvg)}"`));
  assert.match(strip(r.text), new RegExp(`^legt ihr zur Seite – ${Math.round(r.q.savings * 100)} % von`));
});

test('Große Momente: Bild je Ereignis nach dem Namen, Zuflüsse als Geschenk', () => {
  const a = demo();
  const emo = e => a.run(`_psEventEmo(${JSON.stringify(e)})`);
  assert.equal(emo({ name: 'Neues Auto', from: 'Cash' }), '🚗');
  assert.equal(emo({ name: 'Renovierung Küche', from: 'Cash' }), '🏠');
  assert.equal(emo({ name: 'Weltreise', from: 'Cash' }), '✈️');
  assert.equal(emo({ name: 'Erbschaft', from: '' }), '🎁');
  assert.equal(emo({ name: 'Irgendwas', from: '' }), '🎁');
  assert.equal(emo({ name: 'Irgendwas', from: 'Cash' }), '✨');
});

test('Darstellung: bunte Verläufe, Bild und Witz im Story-Rahmen, weniger Bewegung respektiert', () => {
  assert.match(html, /\$\{x\.emo\?`<span class="ps-emo" aria-hidden="true">\$\{x\.emo\}<\/span>`:''\}<p class="ps-k">/);
  assert.match(html, /\$\{x\.joke\?`<p class="ps-joke">\$\{x\.joke\}<\/p>`:''\}/);
  assert.match(html, /\.ps-s\.on::before\{animation:psBlob 9s/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.ps-s\.on \.ps-emo[^}]*\.ps-s\.on \.ps-gauge \.fg[^}]*\{animation:none\}\}/);
  assert.match(html, /@media \(max-height:720px\)\{\.ps-s\{padding-top:84px\}/);
});
