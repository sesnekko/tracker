const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const History=require('../loan-history.js');
const Loan=require('../loan-model.js');
const Data=require('../data-store.js');
const {app,MemoryStorage}=require('./app-harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const fields=[{id:'home',label:'Haus',category:'realEstate',displayGroup:'Haus',custom:true},{id:'cash',label:'Konto',category:'cash',displayGroup:'Cash',custom:true},{id:'loan',label:'Hauskredit',category:'liab',displayGroup:'Kredite',custom:true}];
const params={loan:{principal:100000,rate:4,repayment:2,firstDue:'2026-01',assetId:'home'}};
function document(){
  const d=Data.empty();d.groups=[{id:'homes',name:'Haus',assumptions:{}},{id:'cash',name:'Cash',assumptions:{}},{id:'debts',name:'Kredite',assumptions:{}}];
  d.positions=fields.map((f,i)=>({id:f.id,name:f.label,category:f.category,groupId:['homes','cash','debts'][i],archived:false,custom:true,ticker:null,unit:null}));
  d.snapshots=[{month:'2026-10',positions:[{positionId:'home',value:150000},{positionId:'cash',value:2000}]}];
  d.loans=[{positionId:'loan',principalAmount:100000,interestPercent:4,initialRepaymentPercent:2,firstPaymentMonth:'2026-01',linkedAssetId:'home'}];return d;
}
function context(){const a=app(html);a.context.fixture=document();a.run("appStorage.importBackup(fixture);_fc=loadFieldConfig();selectedMonth='2026-10'");return a;}
test('a linked annuity creates every month from first due through the present and raises equity by principal repaid',()=>{
  const raw={'2026-10':{_details:{home:150000,cash:2000},_units:{}}};const before=JSON.stringify(raw);
  const h=History.build(raw,fields,params,'2026-10');assert.equal(Object.keys(h.data).length,10);assert.equal(h.generated.length,9);
  assert.equal(h.data['2026-01']._details.home,150000);assert.equal(h.data['2026-01']._details.loan,Loan.at(params.loan,'2026-01').balance);
  assert.equal(h.data['2026-02']._details.loan,Loan.at(params.loan,'2026-02').balance);
  assert.equal(h.data['2026-10']._details.home,150000);assert.equal(h.data['2026-10']._details.cash,2000);
  assert.equal(h.data['2026-01']._details.cash,undefined); // No invented prior cash history.
  assert.equal(150000-h.data['2026-01']._details.loan,50166.67);
  assert.equal(JSON.stringify(raw),before);
});
test('observed asset values and explicit zero are preserved; gaps carry the last observation and extras change net worth',()=>{
  const raw={'2026-02':{_details:{home:130000},_units:{}},'2026-04':{_details:{home:0},_units:{}},'2026-10':{_details:{home:150000},_units:{}}};
  const p={loan:{...params.loan,extras:[{id:'x',month:'2026-03',amount:10000}]}};
  const h=History.build(raw,fields,p,'2026-10');
  assert.equal(h.data['2026-01']._details.home,130000);assert.equal(h.data['2026-03']._details.home,130000);
  assert.equal(h.data['2026-04']._details.home,0);assert.equal(h.data['2026-05']._details.home,0);assert.equal(h.data['2026-10']._details.home,150000);
  assert.equal(h.data['2026-03']._details.loan,Loan.at(p.loan,'2026-03').balance);
  assert.ok(h.data['2026-03']._details.loan<h.data['2026-02']._details.loan-10000);
  assert.deepEqual(h.data['2026-03']._loanHistory.estimatedAssetIds,['home']);
});
test('multiple loans combine on one asset, continue after payoff, and an unlinked loan keeps its own history',()=>{
  const fs=[...fields,{id:'second',category:'liab'}];
  const p={loan:{principal:1200,rate:0,pay:400,firstDue:'2026-01',assetId:'home'},second:{principal:600,rate:0,pay:100,firstDue:'2026-03',assetId:'home'}};
  const h=History.build({'2026-10':{_details:{home:150000}}},fs,p,'2026-10');
  assert.equal(h.data['2026-02'].liab,400);assert.equal(h.data['2026-03'].liab,500);assert.equal(h.data['2026-08'].liab,0);assert.equal(h.data['2026-10'].liab,0);
  p.loan.assetId=null;p.second.assetId=null;
  assert.equal(History.build({'2026-10':{_details:{home:150000}}},fs,p,'2026-10').generated.length,9);
});
test('derived dates and estimated prices never become saved observations just by saving another month',()=>{
  const raw={'2026-02':{_details:{cash:1000},_units:{}},'2026-10':{_details:{home:150000,cash:2000},_units:{}}};
  const h=History.build(raw,fields,params,'2026-10'),saved=History.stored(h.data,raw);
  assert.deepEqual(Object.keys(saved).sort(),Object.keys(raw).sort());assert.equal(saved['2026-02']._details.home,undefined);
  assert.equal(saved['2026-10']._details.home,150000);assert.equal(saved['2026-02']._loanHistory,undefined);
  // Explicitly editing a computed month creates an ordinary observation.
  h.data['2026-03']={_details:{home:140000,loan:999},_units:{}};
  assert.equal(History.stored(h.data,raw)['2026-03']._details.home,140000);
});
test('future and incomplete contracts do not fabricate a past; loans with no asset price still show debt',()=>{
  const raw={'2026-10':{_details:{home:150000}}};
  assert.equal(History.build(raw,fields,{loan:{...params.loan,firstDue:'2027-01'}},'2026-10').generated.length,0);
  assert.equal(History.build(raw,fields,{loan:{rate:4,pay:500,assetId:'home'}},'2026-10').generated.length,0);
  const h=History.build({},fields,params,'2026-10');assert.equal(Object.keys(h.data).length,10);assert.equal(h.data['2026-01'].liab,99833.33);assert.equal(h.estimated.length,0);
});
test('actual application exposes linked net history, including negative equity, and includes the loan in asset details',()=>{
  const a=context();assert.equal(a.json('Object.keys(loadData()).length'),10);
  assert.equal(a.json("calc(loadData()['2026-01']).net"),50166.67);
  assert.equal(a.json("_netChartGroups().find(g=>g.label==='Haus').subIds[0]"),'loan');
  assert.equal(a.json("getAssetDetailMap().Haus.find(p=>p.negative).key"),'loan');
  assert.equal(a.json("assetGroupValue(loadData()['2026-01']._details,'Haus',true)"),50166.67);
  assert.equal(a.run("_groupVal({home:500,loan:1000},{addIds:['home'],subIds:['loan']})"),-500);
});
test('live month remains a writable snapshot, while JSON backup reconstructs the same derived history on another device',()=>{
  const a=context();a.run('ensureNextMonth()');
  assert.equal(a.json("loadStoredData()['2026-11']._details.home"),150000);assert.equal(a.json("loadStoredData()['2026-01'] ?? null"),null);
  a.run("const d=loadData();d['2026-11']._details.home=151000;saveData(d)");assert.equal(a.json("loadStoredData()['2026-11']._details.home"),151000);
  const exported=a.json('appStorage.exportBackup()');assert.equal(exported.snapshots.length,2);
  const b=app(html,new MemoryStorage());b.context.exported=exported;b.run('appStorage.importBackup(exported);_fc=loadFieldConfig()');
  assert.deepEqual(b.json('loadData()'),a.json('loadData()'));
});
test('editing terms recalculates the entire history instead of retaining stale computed balances',()=>{
  const a=context();const old=a.json("loadData()['2026-01']._details.loan");
  a.run("const p=getLoanParams();p.loan.pay=1000;appStorage.setItem('loanParams',JSON.stringify(p))");
  assert.ok(a.json("loadData()['2026-01']._details.loan")<old);
  assert.equal(a.json("loadData()['2026-08']._details.loan"),Loan.at({...params.loan,pay:1000},'2026-08').balance);
  assert.equal(a.json('appStorage.document().snapshots.length'),1);
});
