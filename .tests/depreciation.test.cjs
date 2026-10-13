const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app,MemoryStorage}=require('./app-harness.cjs');
const Data=require('../data-store.js');
const Asset=require('../asset-model.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

const car={method:'percent',amount:15,interval:'year',startMonth:'2026-01',startValue:30000};
function fixture(dep){
  const d=Data.empty();
  d.groups=[{id:'g1',name:'Cash',assumptions:{}},{id:'g2',name:'Auto',assumptions:{}}];
  d.positions=[
    {id:'konto',name:'Girokonto',category:'cash',groupId:'g1',archived:false,custom:false,ticker:null,unit:null},
    {id:'auto',name:'Auto',category:'vehicle',groupId:'g2',archived:false,custom:true,ticker:null,unit:null,liquidity:'illiquid',valuation:'manual',...(dep?{depreciation:dep}:{})}
  ];
  d.snapshots=[
    {month:'2025-12',positions:[{positionId:'konto',value:1000},{positionId:'auto',value:99}]},
    {month:'2026-06',positions:[{positionId:'konto',value:1500},{positionId:'auto',value:27000}]},
    {month:'2027-03',positions:[{positionId:'konto',value:2000}]}
  ];
  return d;
}
function context(doc,month='2027-03'){
  const a=app(html,new MemoryStorage({[Data.KEY]:JSON.stringify(doc)}));a.context.CSS={escape:String};a.run(`selectedMonth='${month}'`);return a;
}
const stored=(a,m,id)=>(a.json('appStorage.document()').snapshots.find(s=>s.month===m).positions.find(p=>p.positionId===id)||{}).value;

test('percentage depreciation reduces the remaining value at the end of each period; absolute stops at zero',()=>{
  assert.equal(Asset.depreciatedValue(car,'2025-12'),null);
  assert.equal(Asset.depreciatedValue(car,'2026-12'),30000);
  assert.equal(Asset.depreciatedValue(car,'2027-01'),25500);
  assert.equal(Asset.depreciatedValue(car,'2028-01'),21675);
  const q={method:'absolute',amount:500,interval:'quarter',startMonth:'2026-01',startValue:1200};
  assert.deepEqual(['2026-03','2026-04','2026-07','2026-10'].map(m=>Asset.depreciatedValue(q,m)),[1200,700,200,0]);
  const m={method:'percent',amount:1,interval:'month',startMonth:'2026-01',startValue:1000};
  assert.equal(Asset.depreciatedValue(m,'2026-03'),980.1);
  assert.equal(Asset.depreciationValid({...car,amount:120}),false);
});

test('depreciation travels in the single backup file and malformed settings are rejected',()=>{
  const store=Data.createStore(new MemoryStorage());store.importBackup(fixture(car));
  const copy=Data.createStore(new MemoryStorage());copy.importBackup(store.exportBackup());
  assert.deepEqual(copy.document().positions[1].depreciation,car);
  assert.equal(copy.document().schemaVersion,Data.VERSION);
  for(const bad of [{...car,method:'linear'},{...car,interval:'week'},{...car,amount:0},{...car,amount:150},{...car,startMonth:'01/26'},{...car,extra:1}]){
    assert.throws(()=>Data.validate(fixture(bad)));
  }
  const liab=fixture();liab.positions[0]={...liab.positions[0],category:'liab',depreciation:car};
  assert.throws(()=>Data.validate(liab),/Vermögenswerte/);
});

test('the schedule determines every month from purchase on, manual values stay stored, before purchase it counts zero',()=>{
  const a=context(fixture(car));
  const d=a.json('loadData()');
  assert.equal(d['2026-06']._details.auto,30000);
  assert.equal(d['2027-03']._details.auto,25500);
  assert.equal(d['2025-12']._details.auto,0);
  a.run("const d=loadData();d['2027-03']._details.konto=2100;saveData(d)");
  assert.equal(stored(a,'2026-06','auto'),27000,'own value kept');
  assert.equal(stored(a,'2025-12','auto'),99);
  assert.equal(stored(a,'2027-03','auto'),undefined,'derived value not written');
  assert.equal(stored(a,'2027-03','konto'),2100);
});

function fillDep(a,prefix,{on=true,value='30.000',start='2026-01',method='percent',amount='15',interval='year'}={}){
  a.el(prefix+'-depOn').getAttribute=()=>String(on);a.el(prefix+'-depGroup').hidden=false;
  Object.entries({depValue:value,depStart:start,depMethod:method,depAmount:amount,depInterval:interval}).forEach(([k,v])=>{a.el(prefix+'-'+k).value=v;});
  const base={name:'Auto',category:'vehicle',valuation:'manual',liquidity:'illiquid',unit:'Stück',provider:'yahoo',symbol:''};
  if(prefix!=='newAsset')Object.entries(base).forEach(([k,v])=>{a.el(prefix+'-'+k).value=v;});
}
test('switching depreciation on in the sheet creates the months since purchase; switching off keeps the computed history',()=>{
  const doc=fixture();doc.snapshots=[{month:'2027-03',positions:[{positionId:'konto',value:2000},{positionId:'auto',value:26000}]}];
  const a=context(doc);
  a.run("openAssetSheet('auto')");fillDep(a,'asset-auto',{start:'2026-11'});a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'),false,a.el('dsError').textContent);
  const after=a.json('appStorage.document()');
  assert.deepEqual(after.positions[1].depreciation,{method:'percent',amount:15,interval:'year',startMonth:'2026-11',startValue:30000});
  assert.deepEqual(after.snapshots.map(s=>s.month),['2026-11','2026-12','2027-01','2027-02','2027-03']);
  assert.equal(a.json("loadData()['2026-11']._details.auto"),30000);
  a.run("openAssetSheet('auto')");fillDep(a,'asset-auto',{on:false});a.run('_submitSheet()');
  const off=a.json('appStorage.document()');
  assert.equal(off.positions[1].depreciation,undefined);
  assert.equal(stored(a,'2026-12','auto'),30000);
  assert.equal(stored(a,'2027-03','auto'),26000,'own value of that month is kept');
});

test('a new asset with depreciation starts its history at the purchase month',()=>{
  const a=app(html,new MemoryStorage());a.context.CSS={escape:String};a.run("selectedMonth='2026-11'");
  for(const [k,v] of Object.entries({name:'Uhr',category:'illiquid',valuation:'manual',liquidity:'illiquid',unit:'Stück',value:'',quantity:'',since:''})){a.context.k=k;a.el(a.run("_assetId('newAsset',k)")).value=v;}
  fillDep(a,'newAsset',{value:'8.000',start:'2026-08',method:'absolute',amount:'100',interval:'month'});
  assert.equal(a.run("addCustomField('assets')"),true);
  const id=a.json('appStorage.document()').positions[0].id;
  assert.deepEqual(a.json('Object.keys(loadData()).sort()'),['2026-08','2026-09','2026-10','2026-11']);
  assert.deepEqual(['2026-08','2026-09','2026-11'].map(m=>a.json(`loadData()['${m}']._details['${id}']`)),[8000,7900,7700]);
});

test('month sheet shows depreciated assets as automatic values',()=>{
  const a=context(fixture(car));
  a.run('openMonthSheet()');
  const body=a.el('dsBody').innerHTML;
  assert.match(body,/data-ms-fixed-asset="25500"/);assert.doesNotMatch(body,/data-ms-val="auto"/);
});
