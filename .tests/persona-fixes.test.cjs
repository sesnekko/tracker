/* Befunde der Persona-Simulation vom 14.10.2026 (.docs/Onboarding Persona/Ergebnis_Simulation_2026-10-14.md):
   Erfassung je Person in der Einrichtung, sichtbare Annahmen, vollständiges Löschen und Darstellung. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Data=require('../data-store.js');
const {app,MemoryStorage}=require('./app-harness.cjs');
const {fixture}=require('./forecast-fixture.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function context(storage){return app(html,storage);}
function state(mode='full',patch={}){
  return {mode,i:0,focus:{budget:false,future:false},assets:[],debts:[],hasDebts:null,budgetSkipped:false,futureSkipped:false,
    budget:{income:'',fixed:'',living:'',saving:'',target:''},future:{birthYear:'',retireAge:'67',need:'',needFromBudget:false},pension:'',
    household:{partner:null,children:[]},hist:{},history:{},historyFailed:[],...patch};
}
const asset=(id,name,category,amount)=>({id,name,category,amount,qty:'',mode:'eur'});
function apply(a,s){
  a.context.s=s;
  a.run(`appStorage.importBackup(buildSetupDocument(AssetsData.empty(),s,'2026-10','2026-11'));_fc=loadFieldConfig();_modsCache=null;_ltCalcCache=null;_loanShareMemo={key:null,val:null};_orphanMemo={key:null,val:null};selectedMonth='2026-11';`);
  return a.json('appStorage.document()');
}
/* P10 Wagner: Beamter (Altersgrenze 62, Ruhestand mit 60), Partnerin angestellt bis 65, Sparrate auf drei Anlagen */
function p10(patch={}){
  return state('full',{focus:{budget:true,future:true},
    household:{partner:{name:'Claudia',by:'1977'},children:[]},
    assets:[asset('a1','Girokonto','cash','5.000'),asset('a3','Tagesgeld','cash','28.000'),asset('a4','Bausparvertrag','other','18.500'),asset('a5','ETF','etf','62.000'),asset('a6','Auto','vehicle','18.000')],
    hasDebts:true,debts:[{id:'d1',name:'Ratenkredit',link:'',amount:'9.000',pay:'',rate:''}],
    budget:{income:'3.700',others:{partner:'2.250'},rent:'900',fixed:'1.890',living:'2.629',saving:'',target:'',split:{a5:'700',a4:'150',a3:'600'}},
    future:{birthYear:'1975',retireAge:'60',partnerRetire:'65',need:'3.600',needFromBudget:false},
    pens:{me:{kind:'civil',basis:'now',amount:'',salary:'',pay:'5.260',years:'26',age:'62',from:''},partner:{kind:'statutory',basis:'now',amount:'',salary:'',pay:'',years:'',age:'',from:''}},
    pension:'',pensionSalary:'',...patch});
}

test('A2/B3: Gehalt je Person, Mieteinnahmen im Ruhestand und eine auf mehrere Anlagen verteilte Sparrate',()=>{
  const a=context(),s=p10();
  s.pens.partner.amount='1.203';s.pens.partner.salary='46.000';
  const doc=apply(a,s),items=Object.fromEntries(doc.budget.items.map(i=>[i.id,i]));
  const partner=doc.retirement.people[0];
  assert.equal(items['setup-income'].monthlyAmounts[0],3700);
  assert.equal(items['setup-income'].personId,undefined,'eigenes Gehalt ohne Person');
  assert.equal(items['setup-income-partner'].personId,partner.id,'Gehalt der Partnerin endet mit ihrem Arbeitsende');
  assert.equal(items['setup-rent'].retirementIncome,true,'Miete läuft im Ruhestand weiter');
  const saves=doc.budget.items.filter(i=>i.kind==='saving');
  assert.deepEqual(saves.map(i=>[i.name,i.monthlyAmounts[0]]),[['Sparen Tagesgeld',600],['Sparen Bausparvertrag',150],['Sparen ETF',700]]);
  const byGroup=Object.fromEntries(doc.groups.map(g=>[g.name,g.assumptions.monthlySaving]));
  assert.equal(byGroup.Cash,600);assert.equal(byGroup['Weitere Anlagen'],150);assert.equal(byGroup.ETF,700);
  assert.equal(partner.workUntilAge,65,'Ruhestand der Partnerin aus dem Zukunft-Schritt');
  /* Budget: Einnahmen inkl. Kindergeld 0, Ausgaben 1.890 + 2.629, Sparen 1.450 */
  a.context.s=s;assert.equal(a.json('_setupBudget(s).left'),3700+2250+900-1890-2629-1450);
});

test('A1/A4: Rente je Person – Pension mit Altersgrenze und Beginn zum Ruhestand, gesetzliche Rente der Partnerin',()=>{
  const a=context(),s=p10();
  s.pens.partner.amount='1.203';s.pens.partner.salary='46.000';
  const doc=apply(a,s);
  assert.deepEqual(doc.retirement.primary.civilServicePension,{pensionableSalary:5260,serviceYears:26,retirementAge:62,startAge:60});
  const sp=doc.retirement.people[0].statutoryPension;
  assert.ok(Math.abs(sp.points-1203/42.52)<1e-3);assert.equal(sp.annualSalary,46000);
  assert.equal(doc.preferences.modules.pension,true);
  /* gewünscht mit 60, Antragsruhestand frühestens mit der besonderen Altersgrenze 62: die Anhebung wird erklärt */
  const r=a.json('calcBeamtePension(getLifetimeSettings(),getBeamte())');
  assert.equal(r.age,62);assert.equal(r.want,60);assert.equal(r.cut,0);
  assert.match(a.run('_bvResultLine(getBeamte(),calcBeamtePension(getLifetimeSettings(),getBeamte()))'),/Gewünscht ab 60.*mit 62/);
  /* C5: die Pension beginnt im Vorruhestand; der Phasentext nennt den Wechsel */
  const txt=a.run('(()=>{const st=getLifetimeSettings(),p=buildPlan(),b=_phaseBounds(st,p.currentAge,p.horizonAge);return _phaseText(st,p,2,b);})()');
  assert.match(txt,/ab 62: .* Rente/);
});

test('A1/B2: Versorgungswerk, laufende Rente und künftige Regelaltersrente; „Weiß nicht“ schreibt nichts',()=>{
  const a=context();
  const s=state('full',{focus:{budget:false,future:true},household:{partner:{name:'Monika',by:'1960'},children:[]},
    future:{birthYear:'1964',retireAge:'63',need:'3.000',needFromBudget:false},
    pens:{me:{kind:'chamber',basis:'now',amount:'',salary:'',pay:'',years:'',age:'',from:'65'},partner:{kind:'running',basis:'now',amount:'1.100',salary:'',pay:'',years:'',age:'',from:''}},
    pension:'2.400'});
  const doc=apply(a,s);
  const [chamber,running]=doc.retirement.incomes;
  assert.deepEqual([chamber.name,chamber.monthlyAmount,chamber.fromAge,chamber.personId],['Versorgungswerk',2400,65,undefined]);
  assert.deepEqual([running.name,running.monthlyAmount,running.fromAge,running.personId],['Laufende Rente Monika',1100,65,doc.retirement.people[0].id],'läuft schon: ab heutigem Alter');
  const fut=apply(context(),state('full',{focus:{budget:false,future:true},future:{birthYear:'1990',retireAge:'67',need:'2.000',needFromBudget:false},
    pens:{me:{kind:'statutory',basis:'future',amount:'',salary:'',pay:'',years:'',age:'',from:''}},pension:'1.700',pensionSalary:'60.000'}));
  assert.ok(Math.abs(fut.retirement.primary.statutoryPension.points-1700/42.52)<1e-3);
  assert.equal(fut.retirement.primary.statutoryPension.annualSalary,undefined,'die künftige Rente enthält die weiteren Beiträge schon');
  const none=apply(context(),state('full',{focus:{budget:false,future:true},future:{birthYear:'1990',retireAge:'67',need:'2.000',needFromBudget:false},
    pens:{me:{kind:'none',basis:'now',amount:'',salary:'',pay:'',years:'',age:'',from:''}},pension:'1.700'}));
  assert.equal(none.preferences.modules.pension,false);assert.equal(none.retirement.primary.statutoryPension.points,undefined);
  /* Ansicht: je Person eine Karte mit den fünf Arten */
  a.context.s=state('full',{household:{partner:{name:'Monika',by:'1960'},children:[]}});
  const v=a.json('_setupPensionView(s)');
  assert.equal(v.title,'Wie seid ihr fürs Alter abgesichert?');
  assert.equal((v.body.match(/data-act="pen-kind"/g)||[]).length,10);
  assert.match(v.body,/data-k="partner" data-v="civil"/);
});

test('B1/A3: neue Anlagen starten in Euro; Altersvorsorge und Beteiligung als eigene Chips (gebunden bzw. nicht entnehmbar)',()=>{
  const a=context();a.run('startSetup()');
  const chips=a.json('SETUP_ASSETS.map(x=>x[0])'),i=label=>String(chips.indexOf(label));
  for(const label of ['ETF','Bitcoin','Gold','Altersvorsorge','Beteiligung']){
    a.context.ev={target:{closest:()=>({dataset:{act:'add-asset',i:i(label)}})}};a.run('_setupClick(ev)');
  }
  assert.deepEqual(a.json('_setup.assets.map(r=>[r.category,r.mode])'),[['etf','eur'],['bitcoin','eur'],['metal','eur'],['bav','eur'],['illiquid','eur']]);
  a.run("_setup.assets.forEach((r,k)=>r.amount=String((k+1)*1000))");
  const doc=apply(a,a.json('_setup'));
  const cat=Object.fromEntries(doc.positions.map(p=>[p.name,p.category]));
  assert.equal(cat.Altersvorsorge,'bav');assert.equal(cat.Beteiligung,'illiquid');
  assert.equal(a.run("AssetModel.liquidity({category:'illiquid'})"),'illiquid');
});

test('B6: der Fortschritt hat feste Kapitel; Verlauf und Rente wachsen ihn nicht',()=>{
  const a=context();a.run('startSetup()');
  const segs=()=>(a.el('onboardingOverlay').innerHTML.match(/<i class="[^"]*"><b><\/b><\/i>/g)||[]).length;
  assert.equal(segs(),7);
  a.run("_setup.focus.budget=true;_setup.focus.future=true;_setup.i=_setupSteps().indexOf('pension');_setupRender()");
  assert.equal(segs(),7);
  assert.match(a.el('onboardingOverlay').innerHTML,/aria-valuenow="6"/,'Rente gehört zum Kapitel Zukunft');
});

test('A8: Ruhestand in der Vergangenheit nur nach Rückfrage; dann zählt die eigene Rente als laufend',async()=>{
  const a=context();a.run('startSetup()');
  a.run("Object.assign(_setup,{focus:{budget:false,future:true}});_setup.future={birthYear:'1969',retireAge:'57',need:'2.000',needFromBudget:false};_setup.i=_setupSteps().indexOf('future');");
  a.run("_ask=async()=>false");await a.run('_setupNext()');
  assert.equal(a.json('_setupSteps()[_setup.i]'),'future','abgelehnt: bleibt beim Alter');
  a.run("_ask=async o=>(asked=o.title,true)");await a.run('_setupNext()');
  assert.equal(a.json('asked'),'Schon im Ruhestand?');
  assert.equal(a.json('_setupSteps()[_setup.i]'),'pension');
  assert.equal(a.json("_setupPen(_setup,'me').kind"),'running');
});

test('A7: „Alle Daten löschen“ entfernt auch die Kopie vor dem Update und die Merker dieses Geräts',async()=>{
  const old=fixture();old.schemaVersion=12;const raw=JSON.stringify(old);
  const keys=['vermoegen-last-backup','vermoegen-month-done','vermoegen-month-reminder','vermoegen-loan-history-seen','vermoegen-tips-dismissed','vermoegen-chart-defaults'];
  const st=new MemoryStorage({[Data.KEY]:raw,...Object.fromEntries(keys.map(k=>[k,'x']))});
  const a=context(st);
  a.run('_ask=async()=>true');await a.run('resetApp()');
  assert.equal(st.getItem(Data.BACKUP_KEY),null,'keine Kopie des alten Stands');
  assert.deepEqual(JSON.parse(st.getItem(Data.KEY)).snapshots,[]);
  for(const k of keys)assert.equal(st.getItem(k),null,k);
  /* Store: ohne Option bleibt das Sichern des Originals (P37) wie bisher */
  const st2=new MemoryStorage({[Data.KEY]:raw}),s2=Data.createStore(st2);s2.clear();
  assert.equal(st2.getItem(Data.BACKUP_KEY),raw);
  const st3=new MemoryStorage({[Data.KEY]:raw,[Data.BACKUP_KEY]:raw}),s3=Data.createStore(st3);s3.clear({discardBackup:true});
  assert.equal(st3.getItem(Data.BACKUP_KEY),null);
});

test('A9: ein neues Ereignis zählt sofort (liquide → Ausgabe); „Extern → Extern“ wird erklärt',()=>{
  const a=context();
  assert.equal(a.run("EVENT_COLS.rowHint({from:'',to:'',amount:5000})").length>0,true);
  assert.equal(a.run("EVENT_COLS.rowHint({from:'*',to:'',amount:5000})"),'');
  assert.match(a.run("_planRowsHTML([{id:'e1',name:'Auto',year:2030,amount:5000,from:'',to:''}],EVENT_COLS,'live','ev')"),/class="plan-row-hint">Von „Extern“/);
  assert.match(html,/'Ereignis',\(\)=>\(\{id:_newRowId\('event-'\),name:'',year:new Date\(\)\.getFullYear\(\)\+5,amount:'',from:'\*',to:''\}\)/);
});

test('A12: „Zinsbindung bis“ steht auch ohne Darlehensvertrag; „in Jahren“ nur, wenn schon erfasst',()=>{
  const a=context();
  const sheet=p=>a.run(`_loanSheetHTML('k1',{id:'k1',label:'Kredit'},${JSON.stringify(p)},{isNew:false,balanceTitle:'Stand'})`);
  assert.match(sheet({rate:3,pay:500}),/data-k="fixed"/);
  assert.doesNotMatch(sheet({rate:3,pay:500}),/data-k="fixedYears"/);
  assert.match(sheet({rate:3,pay:500,fixedYears:10}),/data-k="fixedYears"/);
  assert.match(a.run("_loanSummaryText(100000,{rate:3,pay:900})"),/schuldenfrei ca\./);
});

test('B5/A1: Vorschläge passen zur Lage – Rate und Zins beim Ratenkredit, fehlende Rente einer Person',()=>{
  const a=context(),s=p10();
  s.pens.me.kind='none';
  apply(a,s);
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  const tips=a.json('_nextSteps().map(t=>t.title)');
  assert.ok(tips.includes('Rente für Claudia ergänzen'),tips.join(' | '));
  assert.ok(tips.includes('Rate und Zins für „Ratenkredit“'),tips.join(' | '));
  assert.ok(!tips.some(t=>/genauer erfassen/.test(t)),'kein Darlehensvertrag für einen Ratenkredit');
});

test('A10/A5: Hinweise bei sehr wenigen Punkten und bei Punkten, die schon die EM-Rente ergeben',()=>{
  const a=context();
  const line=d=>a.run(`(()=>{const d=Object.assign({},DRV_DEFAULTS,${JSON.stringify(d)});return _drvResultHTML(d,calcDrvPension(getLifetimeSettings(),d),67);})()`);
  assert.match(line({points:2.1}),/fünf Beitragsjahren/);
  assert.doesNotMatch(line({points:2.1,salary:30000}),/fünf Beitragsjahren/,'mit weiteren Beiträgen kein Hinweis');
  // Schema 19: Rentenpunkte bei einer EM-Rente (ohne Entgeltpunkte laut Bescheid) stammen aus einer früheren Version und
  // werden immer zur Klärung angeboten; „vermutlich mit Zurechnungszeit“ nur, wenn sie schon etwa die EM-Rente ergeben (A5).
  assert.match(line({points:36.3,emType:2,em:1200,salary:18000}),/enthalten vermutlich die Zurechnungszeit/);
  assert.doesNotMatch(line({points:20,emType:2,em:1200}),/vermutlich/);
  assert.match(line({points:20,emType:2,em:1200}),/früheren Version/);
});

test('C2/C8: Kredit ohne Vermögenswert als eigene Zeile, typografisches Minus',()=>{
  const a=context();apply(a,p10());
  const rows=a.json("buildNetGroups(loadData()['2026-11']._details,true).map(g=>[g.key,g.val])");
  assert.deepEqual(rows.find(r=>r[0]==='Fahrzeuge'),['Fahrzeuge',18000],'das Auto behält seinen Wert');
  assert.deepEqual(rows.find(r=>r[0]==='Ratenkredit'),['Ratenkredit',-9000]);
  assert.equal(rows.reduce((x,r)=>x+r[1],0),5000+28000+18500+62000+18000-9000,'die Liste ergibt das Nettovermögen');
  assert.equal(a.run('fmt(-12000)'),'−12.000 €');assert.equal(a.run('fmt(-0.3)'),'0 €');assert.equal(a.run('fmtCompact(-12000)'),'−12 Tsd. €');
});

test('C1: der erste Monat zeigt einen erklärten Leerzustand statt einer Fläche',()=>{
  const a=context();apply(a,p10());
  a.run("charts.net={destroy(){}};renderNetChart()");
  assert.equal(a.el('chartNetStart').hidden,false);
  assert.match(html,/<p class="chart-start" id="chartNetStart" hidden><b>Dein Verlauf beginnt jetzt\.<\/b>/);
});

/* Kompakte Daten- und Prognose-Seite (14.10.2026) */
test('UI: Annahmen stehen auf der Prognose-Seite, die Daten-Seite springt dorthin',()=>{
  const lifetime=html.slice(html.indexOf('<div id="page-lifetime"'),html.indexOf('<!-- /page-lifetime -->'));
  const data=html.slice(html.indexOf('<div id="page-import"'),html.indexOf('<div id="page-lifetime"'));
  assert.match(lifetime,/<section class="lt-assume" id="ltAssume">[\s\S]*id="v2-forecast-sec"[\s\S]*id="lt-events"[\s\S]*id="lt-asset-params-table"/);
  assert.doesNotMatch(data,/id="v2-forecast-sec"/);
  assert.match(data,/id="dsForecastJump"[\s\S]*_v2OpenForecastSettings\(\)/);
  assert.match(html,/:is\(#page-import,#ltAssume\) \.input-group\{display:grid/,'gleiche Optik wie auf der Daten-Seite');
});

/* 15.10.2026: Altersvorsorge wie Vermögenswerte – je Art eine Liste, Eintrag antippen öffnet sein Sheet (vorher: Zeilen, die in
   den Bearbeiten-Modus des ganzen Bereichs sprangen, data-pv-jump, und Karten unter .pv-fields) */
test('UI: Altersvorsorge als Listen je Art und Person; Antippen öffnet das Sheet des Eintrags',()=>{
  const a=context(),s=p10();
  s.pens.partner.amount='1.203';s.pens.partner.salary='46.000';
  apply(a,s);a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  const sum=a.run('_pensionSummaryHTML()');
  const groups=[...sum.matchAll(/<div class="ds-list-t">([^<]+)<\/div>/g)].map(m=>m[1]);
  assert.deepEqual(groups,['Gesetzliche Rente','Beamtenversorgung']);
  const rows=[...sum.matchAll(/data-ds-open="([^"]+)" data-id="([^"]*)"><span class="ds-item-l"><span>([^<]+)<\/span><small>([^<]+)<\/small>/g)].map(m=>[m[1]+':'+m[2],m[3],m[4]]);
  assert.deepEqual(rows.map(r=>r[0]),['drv:me','drv:person-1','bv:me']);
  assert.equal(rows[0][2],'Noch nicht eingetragen','eigene gesetzliche Rente fehlt: Zeile zum Eintragen');
  assert.equal(rows[1][1],'Claudia');
  assert.match(sum,/netto ab 62/);
  assert.match(sum,/data-ds-open="add-pv">\+ Altersvorsorge hinzufügen/);
  const page=a.run("(buildDynamicFormForTest(),document.getElementById('dataPageContent').innerHTML)");
  assert.doesNotMatch(page,/class="ds-sec-actions"|class="pv-fields"|class="pv-sum"|data-pv-jump/,'kein Bearbeiten für den ganzen Bereich');
  const empty=context();assert.match(empty.run('_pensionSummaryHTML()'),/Noch nicht eingetragen/);
});

test('UI: „Nach und nach ergänzen“ zeigt nur beim ersten Vorschlag den Text',()=>{
  const a=context();apply(a,p10());
  a.run("appStorage.setItem('v2-modules',JSON.stringify({assets:true,liab:true,budget:true,forecast:true,pension:true}));_modsCache=null;");
  const h=a.run('_nextStepsHTML()');
  assert.equal((h.match(/class="ns-item/g)||[]).length,3);
  assert.equal((h.match(/class="ns-s"/g)||[]).length,1);
  assert.equal((h.match(/ns-short/g)||[]).length,2);
});
