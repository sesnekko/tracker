const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {app,MemoryStorage}=require('./app-harness.cjs');
const Data=require('../data-store.js');
const Asset=require('../asset-model.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const instrument={provider:'yahoo',symbol:'TEST.DE',exchange:'XETRA',currency:'EUR',name:'Test Fund'};
const quote={priceEUR:123.45,price:123.45,currency:'EUR',asOf:'2026-10-08T09:00:00Z',fetchedAt:'2026-10-08T10:00:00Z'};
function context(){const a=app(html);a.run("selectedMonth='2026-11';_rebuildFormKeepingEdits=()=>{}");return a;}
function fill(a,values,prefix='newAsset'){
  for(const [k,v] of Object.entries(values)){a.context.prefix=prefix;a.context.k=k;a.el(a.run('_assetId(prefix,k)')).value=v;}
}
function add(a,values){fill(a,{name:'Meine Anlage',category:'etf',valuation:'manual',liquidity:'liquid',unit:'Stück',...values});a.run('addCustomField()');return a.json('appStorage.document().positions.at(-1)||null');}
function fixture(){
  const d=Data.empty();d.groups=[{id:'g',name:'Meine Anlage',assumptions:{monthlySaving:0}}];
  d.positions=[{id:'fund',name:'Meine Anlage',category:'etf',groupId:'g',archived:false,custom:true,ticker:'TEST.DE',unit:{name:'Stück',key:'fund'},liquidity:'liquid',valuation:'market',instrument:{...instrument},lastQuote:{...quote}}];
  d.snapshots=[{month:'2026-10',positions:[{positionId:'fund',value:250,quantity:2}]},{month:'2026-11',positions:[{positionId:'fund',value:246.9,quantity:2}]}];return d;
}
test('manual assets can omit quantity or retain fractional units, and never invent savings',()=>{
  const a=context(),p=add(a,{name:'Haus',category:'realEstate',liquidity:'illiquid',value:'500.000,25'});
  assert.equal(p.unit.name,'Stück');assert.equal(a.json('appStorage.document().snapshots[0].positions[0].quantity ?? null'),null);assert.equal(p.category,'realEstate');assert.equal(p.liquidity,'illiquid');
  assert.equal(a.json("loadData()['2026-11']._details")[p.id],500000.25);
  assert.equal(a.json('buildPlan().groups[0].saving'),0);
  const q=add(a,{name:'BTC manuell',category:'bitcoin',quantity:'0,00000001',value:'0,01',unit:'BTC'});
  assert.equal(q.unit.name,'BTC');assert.equal(a.json("loadData()['2026-11']._units")[q.id],0.00000001);
  assert.equal(q.valuation,'manual');
});
test('Bitcoin and Krypto are distinct categories in entry and onboarding',()=>{
  const a=context();assert.match(a.run("_positionEditorHTML('assets')"),/<option value="bitcoin">Bitcoin<\/option>/);
  assert.match(a.run("_positionEditorHTML('assets')"),/<option value="crypto">Krypto<\/option>/);
  const p=add(a,{category:'bitcoin',name:'BTC'}),q=add(a,{category:'crypto',name:'ETH'});
  assert.notEqual(p.category,q.category);
  assert.ok(a.json('ONBOARDING_CATEGORIES').some(c=>c[0]==='bitcoin'));
  assert.ok(a.json('ONBOARDING_CATEGORIES').some(c=>c[0]==='crypto'));
});
test('automatic entry requires confirmed matching instrument and quantity; preserves cents',()=>{
  const a=context();fill(a,{name:'ETF',category:'etf',provider:'yahoo',symbol:'TEST.DE',valuation:'market',quantity:'2,5'});
  a.run('addCustomField()');assert.equal(a.json('appStorage.document().positions.length'),0);
  a.context.result={instrument,quote};a.run("_assetChecks.set('newAsset',{requestKey:'yahoo|TEST.DE',...result})");
  a.run('addCustomField()');assert.equal(a.json('appStorage.document().positions.length'),0);
  a.el('newAsset-confirm').checked=true;a.run('addCustomField()');
  const doc=a.json('appStorage.document()'),p=doc.positions[0];assert.equal(p.valuation,'market');
  assert.equal(doc.snapshots[0].positions[0].value,308.63);assert.equal(doc.snapshots[0].positions[0].quantity,2.5);
  assert.deepEqual(p.instrument,instrument);assert.deepEqual(p.lastQuote,quote);
  assert.equal(a.run("formatNumberWithThousands(308.63)"),'308,63');assert.equal(a.run("_assetNumber(formatNumberWithThousands(308.63))"),308.63);
});
test('changing symbol invalidates confirmation and malformed numbers fail without writes',()=>{
  const a=context();fill(a,{name:'ETF',category:'etf',provider:'yahoo',symbol:'OTHER.DE',valuation:'market',quantity:'2'});
  a.context.result={instrument,quote};a.run("_assetChecks.set('newAsset',{requestKey:'yahoo|TEST.DE',...result})");a.el('newAsset-confirm').checked=true;
  const before=a.storage.getItem(Data.KEY);a.run('addCustomField()');assert.equal(a.storage.getItem(Data.KEY),before);
  for(const bad of ['1,2,3','NaN','-2','1.000.000','2abc']){a.context.bad=bad;assert.throws(()=>a.run('_assetNumber(bad,true)'));}
  assert.throws(()=>a.run("_assetNumber('1000.50')"));assert.equal(a.run("_assetNumber('1.234,50')"),1234.5);
});
test('liquidity override drives KPIs, filters and forecast independently of category',()=>{
  const a=context(),p=add(a,{name:'Gebundener ETF',liquidity:'illiquid',value:'10.000'});
  assert.equal(p.category,'etf');assert.equal(a.json("calc(loadData()['2026-11']).liquid"),0);
  assert.equal(a.json("calc(loadData()['2026-11']).illiquidGross"),10000);
  a.run("kpiChartFilter='illiquid'");assert.deepEqual(a.json('_kpiFilterGroups()[0].addIds'),[p.id]);
  assert.equal(a.json('buildPlan().groups[0].withdrawable'),false);
});
test('single-file backup roundtrip keeps metadata and quote; unrelated writes retain it',()=>{
  const a=Data.createStore(new MemoryStorage());a.importBackup(fixture());a.setItem('darkMode','1');
  const b=Data.createStore(new MemoryStorage());b.importBackup(a.exportBackup());
  assert.deepEqual(b.document().positions,a.document().positions);assert.deepEqual(b.document().snapshots,a.document().snapshots);
  const old=fixture();old.schemaVersion=1;delete old.positions[0].instrument;delete old.positions[0].valuation;delete old.positions[0].lastQuote;delete old.positions[0].liquidity;
  b.importBackup(old);assert.equal(b.document().schemaVersion,2);assert.equal(Asset.valuation(JSON.parse(b.getItem('fieldConfig')).fields[0]),'market');
  assert.deepEqual(b.document().snapshots,old.snapshots);
});
test('invalid quote and automatic configuration fail atomic import; quota fails atomic creation',()=>{
  const store=Data.createStore(new MemoryStorage());store.importBackup(fixture());const before=store.document();
  for(const mutate of [p=>p.liquidity='wrong',p=>p.instrument.provider='unknown',p=>p.instrument=null,p=>p.unit=null,p=>p.lastQuote.priceEUR=-1,p=>p.lastQuote.asOf='invalid']){
    const d=fixture();mutate(d.positions[0]);assert.throws(()=>store.importBackup(d));assert.deepEqual(store.document(),before);
  }
  const a=context();a.storage.failWrites=true;add(a,{value:'200'});assert.equal(a.json('appStorage.document().positions.length'),0);assert.equal(a.json('_fc.fields.length'),0);
});
test('quotes update only the live month and never override manually valued assets',()=>{
  const a=context();a.context.fixture=fixture();a.run("appStorage.importBackup(fixture);_fc=loadFieldConfig();livePrices.fund=200;renderKPIs=()=>{};renderPieChart=()=>{};renderFlowSection=()=>{};applyLivePrices()");
  assert.equal(a.json("loadData()['2026-11']._details.fund"),400);assert.equal(a.json("loadData()['2026-10']._details.fund"),250);
  a.run("selectedMonth='2026-10';livePrices.fund=500;applyLivePrices()");assert.equal(a.json("loadData()['2026-10']._details.fund"),250);
  a.run("selectedMonth='2026-11';_fc.fields[0].valuation='manual';applyLivePrices()");assert.equal(a.json("loadData()['2026-11']._details.fund"),400);
});
test('Yahoo quote resolves name, exchange, Pence and EUR conversion; Kraken reads last trade',async()=>{
  const a=context();
  a.context.response={chart:{result:[{meta:{symbol:'TEST.L',currency:'GBp',regularMarketPrice:1250,regularMarketTime:1791440400,longName:'Test Fund',fullExchangeName:'London'}}]}};
  a.run("fetchWithTimeout=async()=>({ok:true,text:async()=>JSON.stringify(response)});fetchFxToEUR=async()=>1.2");
  const result=await a.run("fetchInstrumentQuote({provider:'yahoo',symbol:'TEST.L'})");assert.equal(result.quote.priceEUR,15);assert.equal(result.quote.currency,'GBp');assert.equal(result.instrument.name,'Test Fund');
  a.context.response={error:[],result:{XETHZEUR:{c:['2000.5','1']}}};
  const crypto=await a.run("fetchInstrumentQuote({provider:'kraken',symbol:'ETHEUR'})");assert.equal(crypto.quote.priceEUR,2000.5);assert.equal(crypto.instrument.name,'ETH / EUR');
  a.context.response={error:['EQuery:Unknown asset pair'],result:{}};
  await assert.rejects(a.run("fetchInstrumentQuote({provider:'kraken',symbol:'NOPEEUR'})"));
});
test('a failed refresh retains the last quote and value with a visible failure timestamp',async()=>{
  const a=context();a.context.fixture=fixture();a.run("appStorage.importBackup(fixture);_fc=loadFieldConfig();fetchInstrumentQuote=async()=>{throw new Error('offline')};renderKPIs=()=>{};renderPieChart=()=>{};renderFlowSection=()=>{}");
  await a.run('etfPriceTick()');
  assert.deepEqual(a.json('appStorage.document().positions[0].lastQuote'),quote);
  assert.equal(a.json("loadData()['2026-11']._details.fund"),246.9);
  assert.match(a.run('_quoteStatus(_fc.fields[0])'),/Abruf fehlgeschlagen · letzter Kurs/);
});
