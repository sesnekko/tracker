const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Data=require('../data-store.js');
const {app}=require('./app-harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function context(){return app(html);}
/* Zustand des Einrichtungs-Assistenten wie nach der Eingabe im Overlay */
function state(mode='full',patch={}){
  return {mode,i:0,focus:{budget:false,future:false},assets:[],debts:[],hasDebts:null,budgetSkipped:false,futureSkipped:false,
    budget:{income:'',fixed:'',living:'',saving:'',target:''},future:{birthYear:'',retireAge:'67',need:'',needFromBudget:false},pension:'',...patch};
}
const asset=(id,name,category,amount)=>({id,name,category,amount});
const debt=(id,name,link,amount,pay='',rate='')=>({id,name,link,amount,pay,rate});
function apply(a,s,original='AssetsData.empty()'){
  a.context.s=s;
  a.run(`appStorage.importBackup(buildSetupDocument(${original},s,'2026-10','2026-11'));_fc=loadFieldConfig();_modsCache=null;_loanShareMemo={key:null,val:null};_orphanMemo={key:null,val:null};selectedMonth='2026-11';`);
  return a.json('appStorage.document()');
}
function budgetAvg(a){return a.json("(()=>{const bd=loadBudgetData(),s={einnahmen:0,ausgaben:0,aufbau:0,tilgung:0,frei:0};for(let m=0;m<12;m++){const c=calcBudgetMonth(bd,m);for(const k in s)s[k]+=c[k]/12;}for(const k in s)s[k]=Math.round(s[k]);return s;})()");}

test('the welcome starts the setup; steps follow the chosen focus; closing returns to the welcome without writing',()=>{
  const a=context(),before=a.storage.getItem(Data.KEY);
  assert.match(a.run('guideWelcome()'),/onclick="startSetup\(\)">Geführt einrichten/);
  a.run('startSetup()');
  assert.deepEqual(a.json('_setupSteps()'),['focus','assets','debts','done']);
  assert.match(a.el('onboardingOverlay').innerHTML,/Wobei soll dir die App helfen/);
  a.run("_setup.focus.budget=true;_setup.focus.future=true;");
  assert.deepEqual(a.json('_setupSteps()'),['focus','assets','debts','budget','future','pension','done']);
  a.run("_setup.futureSkipped=true;");
  assert.deepEqual(a.json('_setupSteps()'),['focus','assets','debts','budget','future','done']);
  a.run('_setupClose()');
  assert.equal(a.json('_setup'),null);
  assert.match(a.el('onboardingOverlay').innerHTML,/Geführt einrichten/);
  assert.equal(a.storage.getItem(Data.KEY),before);
});

test('P01 Max: estimates only; budget, saving rate and pension reach the forecast without extra steps',()=>{
  const a=context();
  const s=state('full',{focus:{budget:true,future:true},
    assets:[asset('a1','Girokonto','cash','2.000'),asset('a2','Tagesgeld','cash','4000'),asset('a3','MSCI World ETF','etf','2.500')],hasDebts:false,
    budget:{income:'2.400',fixed:'850',living:'1.250',saving:'300',target:''},future:{birthYear:'2002',retireAge:'67',need:'',needFromBudget:false},pension:'1.800'});
  a.context.s=s;a.run('_setupPrefillNeed(s)');
  assert.equal(s.future.need,'2.100');assert.equal(s.future.needFromBudget,true);
  const doc=apply(a,s);
  assert.equal(a.json("calc(loadData()['2026-11']).net"),8500);
  assert.deepEqual(doc.snapshots.map(x=>x.month),['2026-10','2026-11']);
  assert.ok(doc.positions.every(p=>p.unit===null&&p.ticker===null));
  assert.deepEqual(doc.preferences.modules,{assets:true,liab:false,pension:true,budget:true,forecast:true});
  assert.equal(doc.preferences.onboardingCompleted,true);
  const b=budgetAvg(a);
  assert.equal(b.einnahmen,2400);assert.equal(b.ausgaben,2100);assert.equal(b.aufbau,300);assert.equal(b.frei,0);
  const etf=doc.groups.find(g=>g.name==='ETF');
  assert.equal(etf.assumptions.monthlySaving,300,'saving flows into the forecast of the target asset');
  assert.equal(doc.budget.items.find(r=>r.kind==='saving').targetGroupId,etf.id);
  assert.equal(doc.retirement.primary.birthYear,2002);
  assert.deepEqual(doc.forecast.settings,{retirementAge:67,saveUntilAge:67,monthlySpending:2100});
  assert.ok(Math.abs(a.json('calcDrvPension(getLifetimeSettings(),getDrv()).brutto')-1800)<0.5);
});

test('P03 Müller: loans link to their asset, rates enter the budget once and repayment counts as wealth building',()=>{
  const a=context();
  const s=state('full',{focus:{budget:true,future:false},
    assets:[asset('a1','Eigenheim','realEstate','480.000'),asset('a2','Gemeinsame Girokonten','cash','8.000'),asset('a3','Tagesgeld','cash','20.000'),asset('a4','MSCI ACWI ETF','etf','45.000'),asset('a5','Familienfahrzeuge','vehicle','22.000')],
    hasDebts:true,debts:[debt('d1','Immobilienkredit','realEstate','390.000','1.750','2,2'),debt('d2','Autokredit','vehicle','20.000','350','5')],
    budget:{income:'6.320',fixed:'1.300',living:'2.320',saving:'600',target:''}});
  const doc=apply(a,s);
  const c=a.json("calc(loadData()['2026-11'])");
  assert.equal(c.assets,575000);assert.equal(c.liab,410000);assert.equal(c.net,165000);
  const id=name=>doc.positions.find(p=>p.name===name).id;
  assert.deepEqual(doc.loans.map(l=>l.linkedAssetId),[id('Eigenheim'),id('Familienfahrzeuge')]);
  assert.deepEqual(doc.loans.map(l=>[l.interestPercent,l.monthlyPayment]),[[2.2,1750],[5,350]]);
  const loans=doc.budget.items.find(r=>r.kind==='loanPayment');
  assert.equal(loans.monthlyAmounts[0],2100);
  const b=budgetAvg(a);
  assert.equal(b.einnahmen,6320);assert.equal(b.frei,0);
  assert.ok(b.tilgung>1200&&b.tilgung<1400,'repayment share of the rates is wealth building: '+b.tilgung);
  assert.equal(b.ausgaben+b.aufbau,6320);
  assert.equal(doc.groups.find(g=>g.name==='ETF').assumptions.monthlySaving,600);
  assert.equal(doc.preferences.modules.forecast,false);
});

test('P06 Julia: negative net wealth; consumer debts stay unlinked',()=>{
  const a=context();
  const s=state('full',{assets:[asset('a1','Girokonto','cash','1.000'),asset('a2','Tagesgeld','cash','2.000'),asset('a3','Auto','vehicle','5.000')],
    hasDebts:true,debts:[debt('d1','Ratenkredit','','15.000','300','8'),debt('d2','Kreditkarte','','5.000','150','15')]});
  const doc=apply(a,s);
  assert.equal(a.json("calc(loadData()['2026-11']).net"),-12000);
  assert.deepEqual(doc.loans.map(l=>l.linkedAssetId),[null,null]);
  assert.equal(doc.preferences.modules.liab,true);
});

test('blank rows are ignored; missing or malformed values explain themselves and store nothing',()=>{
  const a=context(),before=a.storage.getItem(Data.KEY);
  const cases=[
    [state('full',{assets:[asset('a1','Girokonto','cash','')]}),/Girokonto: Bitte ungefähr den Wert/],
    [state('full',{assets:[asset('a1','Girokonto','cash','12abc')]}),/Bitte eine Zahl/],
    [state('full',{hasDebts:true,debts:[debt('d1','Kreditkarte','','','150')]}),/Kreditkarte: Bitte die offene Restschuld/],
    [state('full',{focus:{budget:false,future:true}}),/Geburtsjahr/],
    [state('full',{focus:{budget:false,future:true},future:{birthYear:'1990',retireAge:'67',need:''}}),/was du im Ruhestand pro Monat brauchst/]
  ];
  for(const [s,error] of cases){a.context.s=s;assert.throws(()=>a.run("buildSetupDocument(AssetsData.empty(),s,'2026-10','2026-11')"),error);}
  a.context.s=state('full',{assets:[asset('a1','','cash',''),asset('a2','Konto','cash','0')]});
  const doc=a.json("buildSetupDocument(AssetsData.empty(),s,'2026-10')");
  assert.equal(doc.positions.length,1);assert.equal(doc.snapshots[0].positions[0].value,0);
  a.run("startSetup();_setup.focus.future=true;_setup.i=4;_setupFinish();");
  assert.equal(a.storage.getItem(Data.KEY),before,'a failed finish writes nothing');
  assert.match(a.el('onboardingError').textContent,/Geburtsjahr/);
});

test('skipped areas stay switched off and are offered later; the full setup never overwrites existing data',()=>{
  const a=context();
  const doc=apply(a,state('full',{focus:{budget:true,future:true},budgetSkipped:true,futureSkipped:true,assets:[asset('a1','Depot','etf','10.000')]}));
  assert.deepEqual(doc.preferences.modules,{assets:true,liab:false,pension:false,budget:false,forecast:false});
  assert.equal(doc.budget,null);
  a.context.s=state('full',{assets:[asset('a1','Konto','cash','1')]});
  assert.throws(()=>a.run("buildSetupDocument(appStorage.document(),s,'2026-10')"),/bereits Daten/);
});

test('later mini setups add a single area to existing data and keep everything else',()=>{
  const a=context();
  const base=apply(a,state('full',{assets:[asset('a1','Tagesgeld','cash','4.000'),asset('a2','ETF','etf','6.000')],hasDebts:true,debts:[debt('d1','Ratenkredit','','3.000','200','6')]}));
  a.context.CSS={escape:String};
  const budget=apply(a,state('budget',{budget:{income:'3.000',fixed:'1.000',living:'1.200',saving:'400',target:''}}),'appStorage.document()');
  assert.deepEqual(budget.positions,base.positions);assert.deepEqual(budget.snapshots,base.snapshots);assert.deepEqual(budget.loans,base.loans);
  assert.equal(budget.preferences.modules.budget,true);
  assert.equal(budget.budget.items.find(r=>r.kind==='loanPayment').monthlyAmounts[0],200,'rates of loans without contract are taken over');
  const etf=budget.groups.find(g=>g.name==='ETF');
  assert.equal(budget.budget.items.find(r=>r.kind==='saving').targetGroupId,etf.id,'saving defaults to the depot');
  assert.equal(etf.assumptions.monthlySaving,400);
  a.run("_modsCache=null;startSetup('future')");
  assert.equal(a.json('_setup.future.need'),'2.200','need is suggested from the budget without loan interest');
  const future=apply(a,state('future',{future:{birthYear:'1990',retireAge:'63',need:'2.200'},pension:''}),'appStorage.document()');
  assert.deepEqual(future.budget,budget.budget);
  assert.deepEqual(future.preferences.modules,{assets:true,liab:true,pension:false,budget:true,forecast:true});
  const pension=apply(a,state('pension',{pension:'1.500'}),'appStorage.document()');
  assert.equal(pension.preferences.modules.pension,true);
  assert.equal(pension.forecast.settings.retirementAge,63);
  assert.ok(Math.abs(pension.retirement.primary.statutoryPension.points*42.52-1500)<0.01);
});

test('next steps suggest at most three fitting deepenings, update with the data and can be hidden',()=>{
  const a=context();
  assert.deepEqual(a.json('_nextSteps().map(t=>t.id)'),['first-asset']);
  apply(a,state('full',{assets:[asset('a1','Girokonto','cash','2.000'),asset('a2','MSCI World ETF','etf','2.500')]}));
  const ids=a.json('_nextSteps().map(t=>t.id)');
  assert.equal(ids.length,3);
  assert.deepEqual(ids.slice(0,2),['budget','future']);
  assert.match(ids[2],/^quotes-/);
  a.run("_nsDismiss('budget')");
  assert.deepEqual(a.json('_nextSteps().map(t=>t.id)').slice(0,1),['future']);
  assert.match(a.run('_nextStepsHTML()'),/Nach und nach ergänzen/);
  apply(a,state('future',{future:{birthYear:'1990',retireAge:'67',need:'2.000'}}),'appStorage.document()');
  a.run('_modsCache=null');
  const after=a.json('_nextSteps().map(t=>t.id)');
  assert.ok(!after.includes('future'));assert.ok(after.includes('pension'));
});

/* ── Verlauf aus Kursen ── */
const prices={'2025-10':100,'2025-11':110,'2025-12':90,'2026-01':120,'2026-02':125};
test('one-time purchase keeps the quantity; the current month is not part of the history',()=>{
  const a=context();a.context.prices=prices;
  const h=a.json("reconstructHolding(prices,'2025-11','2026-02',10)");
  assert.deepEqual(h.map(x=>x.month),['2025-11','2025-12','2026-01']);
  assert.deepEqual(h.map(x=>x.quantity),[10,10,10]);
  assert.deepEqual(h.map(x=>x.value),[1100,900,1200]);
});
test('a savings plan buys every month; the rest of today\'s holding counts as an initial purchase',()=>{
  const a=context();a.context.prices=prices;
  const h=a.json("reconstructHolding(prices,'2025-10','2026-02',20,100)");
  const buys=[100/100,100/110,100/90,100/120,100/125],lump=20-buys.reduce((x,y)=>x+y,0);
  assert.ok(Math.abs(h[0].quantity-(lump+buys[0]))<1e-6);
  assert.ok(h.every((x,i)=>i===0||x.quantity>h[i-1].quantity),'holding grows every month');
  assert.ok(Math.abs(h.at(-1).quantity+buys[4]-20)<1e-5,'ends exactly at today\'s holding');
  /* zu hoher Sparplan: Käufe werden auf den heutigen Bestand verkleinert, kein erfundenes Vermögen */
  const big=a.json("reconstructHolding(prices,'2025-10','2026-02',2,1000)");
  assert.ok(big[0].quantity<0.5&&big.at(-1).quantity<2);
});
test('history starts at the first available price and is empty without a past month',()=>{
  const a=context();a.context.prices=prices;
  assert.equal(a.json("reconstructHolding(prices,'2020-01','2026-02',1)")[0].month,'2025-10');
  assert.deepEqual(a.json("reconstructHolding(prices,'2026-02','2026-02',1)"),[]);
  assert.deepEqual(a.json("reconstructHolding({},'2025-01','2026-02',1)"),[]);
});
test('Max: depot history from a savings plan, cash with today\'s value, months marked as calculated',()=>{
  const a=context();
  const quote={priceEUR:125,price:125,currency:'EUR',asOf:'2026-10-08T10:00:00.000Z',fetchedAt:'2026-10-08T10:00:00.000Z'};
  a.context.prices={'2026-06':100,'2026-07':110,'2026-08':120,'2026-09':118,'2026-10':125};
  const months=a.json("reconstructHolding(prices,'2026-07','2026-10',20,300)");
  const s=state('full',{assets:[asset('a1','Girokonto','cash','2.000'),asset('a3','MSCI World ETF','etf','2.500')],hasDebts:true,debts:[debt('d1','Kreditkarte','','500')],
    history:{a3:{instrument:{provider:'yahoo',symbol:'EUNL.DE',exchange:'XETRA',currency:'EUR',name:'iShares Core MSCI World'},quote,quantity:20,months}}});
  const doc=apply(a,s);
  const etf=doc.positions.find(p=>p.name==='MSCI World ETF');
  assert.equal(etf.valuation,'market');assert.equal(etf.instrument.symbol,'EUNL.DE');assert.deepEqual(etf.unit,{name:'Stück',key:etf.id});
  assert.deepEqual(doc.snapshots.map(x=>[x.month,!!x.estimated]),[['2026-07',true],['2026-08',true],['2026-09',true],['2026-10',false],['2026-11',false]]);
  const giro=doc.positions.find(p=>p.name==='Girokonto').id,card=doc.positions.find(p=>p.name==='Kreditkarte').id;
  for(const snap of doc.snapshots.slice(0,3)){
    assert.equal(snap.positions.find(v=>v.positionId===giro).value,2000);
    assert.equal(snap.positions.find(v=>v.positionId===card).value,500);
  }
  const etfJul=doc.snapshots[0].positions.find(v=>v.positionId===etf.id);
  assert.equal(etfJul.value,months[0].value);assert.equal(etfJul.quantity,months[0].quantity);
  assert.equal(doc.snapshots[3].positions.find(v=>v.positionId===etf.id).quantity,20);
  assert.equal(a.json("loadData()['2026-08']._estimated"),true);
  assert.equal(a.run("loadData()['2026-10']._estimated"),undefined);
  /* Ohne „seit wann“: nur Kursquelle, kein Verlauf */
  const b=context();const d2=apply(b,state('full',{assets:[asset('a1','Bitcoin','bitcoin','1.000')],history:{a1:{instrument:{provider:'bitcoin',symbol:'XBTEUR',exchange:'Kraken',currency:'EUR',name:'Bitcoin'},quote,quantity:8,months:[]}}}));
  assert.deepEqual(d2.snapshots.map(x=>x.month),['2026-10','2026-11']);
  assert.equal(d2.positions[0].unit.name,'BTC');
});
test('calculated months survive a backup and become observed once the month is confirmed',()=>{
  const a=context();
  const quote={priceEUR:100,price:100,currency:'EUR',asOf:'2026-10-08T10:00:00.000Z',fetchedAt:'2026-10-08T10:00:00.000Z'};
  apply(a,state('full',{assets:[asset('a1','Depot','etf','1.000')],history:{a1:{instrument:{provider:'yahoo',symbol:'X.DE',exchange:'',currency:'EUR',name:'X'},quote,quantity:10,months:[{month:'2026-09',quantity:10,value:950}]}}}));
  const restored=Data.createStore(new (require('./app-harness.cjs').MemoryStorage)());
  restored.importBackup(JSON.parse(JSON.stringify(a.json('appStorage.exportBackup()'))));
  assert.equal(restored.document().snapshots.find(x=>x.month==='2026-09').estimated,true);
  assert.throws(()=>Data.validate({...restored.document(),snapshots:[{month:'2026-09',positions:[],estimated:'ja'}]}));
  a.run("selectedMonth='2026-09';_afterDataChange=()=>{};_saveMonthSheet();");
  assert.equal(a.run("appStorage.document().snapshots.find(x=>x.month==='2026-09').estimated"),undefined);
  assert.equal(a.json("loadData()['2026-09']._details[appStorage.document().positions[0].id]"),950);
});
test('the history step only appears for assets with prices; savings plans prefill the budget',()=>{
  const a=context();
  a.run("startSetup();_setup.assets=[{id:'a1',name:'Tagesgeld',category:'cash',amount:'100'}]");
  assert.ok(!a.json('_setupSteps()').includes('history'));
  a.run("_setup.assets.push({id:'a2',name:'MSCI World ETF',category:'etf',amount:'2500'},{id:'a3',name:'Bitcoin',category:'bitcoin',amount:'1000'})");
  assert.deepEqual(a.json('_setupSteps()').slice(0,4),['focus','assets','history','debts']);
  a.run("_setupHist(_setup,'a2').mode='plan';_setupHist(_setup,'a2').plan='300';_setupHist(_setup,'a3').mode='plan';_setupHist(_setup,'a3').plan='50';_setupPrefillSaving(_setup)");
  assert.equal(a.json('_setup.budget.saving'),'350');assert.equal(a.json('_setup.budget.target'),'a2');
});
test('incomplete history answers explain what is missing before any download',async()=>{
  const a=context();
  a.run("startSetup();_setup.assets=[{id:'a2',name:'MSCI World ETF',category:'etf',amount:'2500'}];fetchInstrumentQuote=()=>{throw new Error('no network in test')};");
  for(const [patch,error] of [["{month:'3'}",/Monat und Jahr/],["{month:'3',year:'2024'}",/einmal gekauft oder mit Sparplan/],["{month:'3',year:'2024',mode:'plan'}",/Sparplan pro Monat/],["{month:'3',year:'2024',mode:'once'}",/Wertpapier auswählen/],["{month:'12',year:'2026',mode:'once'}",/Zukunft/]]){
    a.run(`_setup.hist={a2:Object.assign(_setupHist({hist:{}},'a2'),${patch})}`);
    await assert.rejects(a.run('_setupBuildHistory(_setup)'),error);
  }
  a.run("_setup.hist={}");await a.run('_setupBuildHistory(_setup)');
  assert.deepEqual(a.json('_setup.history'),{});
});

test('assets can be entered as quantity: value = quantity × current price, price source kept without history',()=>{
  const a=context();
  const quote={priceEUR:75000,price:75000,currency:'EUR',asOf:'2026-10-08T10:00:00.000Z',fetchedAt:'2026-10-08T10:00:00.000Z'};
  const s=state('full',{assets:[{id:'a1',name:'Bitcoin',category:'bitcoin',amount:'',qty:'0,02',mode:'qty'},asset('a2','Girokonto','cash','1.000')],
    hist:{a1:{quote,qinst:{provider:'bitcoin',symbol:'XBTEUR',exchange:'Kraken',currency:'EUR',name:'Bitcoin'}}}});
  const doc=apply(a,s);
  const btc=doc.positions.find(p=>p.name==='Bitcoin');
  assert.equal(btc.valuation,'market');assert.equal(btc.unit.name,'BTC');
  assert.deepEqual(doc.snapshots[0].positions.find(v=>v.positionId===btc.id),{positionId:btc.id,value:1500,quantity:0.02});
  assert.equal(a.json("calc(loadData()['2026-11']).net"),2500);
  /* ohne Kurs oder Wertpapier: verständliche Meldung statt falscher Werte */
  a.context.s=state('full',{assets:[{id:'a1',name:'Bitcoin',category:'bitcoin',amount:'',qty:'0,02',mode:'qty'}],hist:{a1:{quoteFailed:true}}});
  assert.throws(()=>a.run("buildSetupDocument(AssetsData.empty(),s,'2026-10')"),/Wert stattdessen in Euro/);
  a.context.s=state('full',{assets:[{id:'a1',name:'Depot',category:'etf',amount:'',qty:'20',mode:'qty'}],hist:{}});
  assert.throws(()=>a.run("buildSetupDocument(AssetsData.empty(),s,'2026-10')"),/Wertpapier auswählen/);
  a.context.s=state('full',{assets:[{id:'a1',name:'Gold',category:'metal',amount:'',qty:'zwei',mode:'qty'}],hist:{}});
  assert.throws(()=>a.run("buildSetupDocument(AssetsData.empty(),s,'2026-10')"),/gültige Stückzahl/);
});
test('a group with a single position is shown with the position name',()=>{
  const a=context();
  apply(a,state('full',{assets:[asset('a1','Porsche 911','vehicle','65.000'),asset('a2','Tagesgeld','cash','1.000'),asset('a3','Girokonto','cash','500')]}));
  a.run("const fc=loadFieldConfig();fc.fields.find(f=>f.label==='Porsche 911').displayGroup='Sonstiges';fc.fields.filter(f=>f.category==='cash').forEach(f=>f.displayGroup='Cash');saveFieldConfig(fc);_fc=loadFieldConfig();_modsCache=null;");
  assert.equal(a.run("_groupDisplayName('Sonstiges')"),'Porsche 911');
  assert.equal(a.run("_groupDisplayName('Cash')"),'Cash');
});

test('assets of the same kind share one group (e.g. ETF); debts keep their own',()=>{
  const a=context();
  const doc=apply(a,state('full',{assets:[asset('a1','MSCI World','etf','10.000'),asset('a2','Emerging Markets','etf','5.000'),asset('a3','Girokonto','cash','2.000')],hasDebts:true,debts:[debt('d1','Kreditkarte','','500')]}));
  const group=name=>doc.groups.find(g=>g.name===name);
  assert.equal(doc.positions.filter(p=>p.groupId===group('ETF').id).length,2);
  assert.ok(group('Cash')&&group('Kreditkarte'));
  assert.equal(a.run("_groupDisplayName('ETF')"),'ETF');
  assert.equal(a.run("_groupDisplayName('Cash')"),'Cash','category groups keep their name even with one position');
  assert.equal(a.json("buildNetGroups(loadData()['2026-11']._details).find(g=>g.key==='ETF').val"),15000);
});
test('the net chart axis spans only the visible months and lines, without rounding up',()=>{
  const a=context();
  const chart={options:{scales:{x:{min:2,max:3}}},data:{labels:[0,1,2,3],datasets:[{data:[10,500,100,200]},{data:[1,1,50,60]},{data:[9999,9999,9999,9999]}]},isDatasetVisible:i=>i<2};
  a.context.scale={chart,type:'linear'};a.run('_netYLimits(scale)');
  const s=a.context.scale;
  assert.ok(s.min<50&&s.min>=0&&s.max>200&&s.max<215,`${s.min}–${s.max}`);
  a.context.scale={chart,type:'logarithmic'};a.run('_netYLimits(scale)');
  assert.ok(a.context.scale.min>0&&a.context.scale.min<50);
});
