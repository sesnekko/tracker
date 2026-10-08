const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app,MemoryStorage}=require('./app-harness.cjs');
const Data=require('../data-store.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fixture(){
  const d=Data.empty();
  d.groups=[{id:'g1',name:'Cash',assumptions:{}},{id:'g2',name:'Depot',assumptions:{}},{id:'g3',name:'Kredit',assumptions:{}}];
  d.positions=[
    {id:'konto',name:'Girokonto',category:'cash',groupId:'g1',archived:false,custom:false,ticker:null,unit:null},
    {id:'depot',name:'Depot',category:'etf',groupId:'g2',archived:false,custom:false,ticker:null,unit:null},
    {id:'kredit',name:'Autokredit',category:'liab',groupId:'g3',archived:false,custom:false,ticker:null,unit:null}
  ];
  d.snapshots=[
    {month:'2026-08',positions:[{positionId:'konto',value:1000},{positionId:'depot',value:5000},{positionId:'kredit',value:3000}]},
    {month:'2026-10',positions:[{positionId:'konto',value:1200},{positionId:'depot',value:5100},{positionId:'kredit',value:2800}]}
  ];
  return d;
}
function context(doc=fixture(),month='2026-10'){
  const storage=new MemoryStorage({[Data.KEY]:JSON.stringify(doc)});
  const a=app(html,storage);a.context.CSS={escape:String};a.run(`selectedMonth='${month}'`);return a;
}
function fillAsset(a,id,values){
  const base={name:'',category:'cash',valuation:'manual',liquidity:'liquid',unit:'Stück',provider:'yahoo',symbol:''};
  for(const [k,v] of Object.entries({...base,...values}))a.el('asset-'+id+'-'+k).value=v;
}
const snapshot=(a,month)=>a.json('appStorage.document()').snapshots.find(s=>s.month===month);
const value=(s,id)=>(s.positions.find(p=>p.positionId===id)||{}).value;

test('position sheet changes only its own value and keeps the other positions of the month',()=>{
  const a=context();
  a.run("openAssetSheet('konto')");
  fillAsset(a,'konto',{name:'Girokonto'});a.el('f-konto').value='1.350,50';
  a.run('_submitSheet()');
  const s=snapshot(a,'2026-10');
  assert.equal(value(s,'konto'),1350.5);assert.equal(value(s,'depot'),5100);assert.equal(value(s,'kredit'),2800);
  assert.equal(a.json('appStorage.document()').snapshots.length,2);
  assert.equal(a.run('_sheetOpen'),false);
});

test('renaming without changing the value writes no month and keeps the history untouched',()=>{
  const a=context(fixture(),'2026-09');
  a.run("openAssetSheet('konto')");
  fillAsset(a,'konto',{name:'Hauptkonto'});a.el('f-konto').value='1.000';
  a.run('_submitSheet()');
  const doc=a.json('appStorage.document()');
  assert.equal(doc.positions.find(p=>p.id==='konto').name,'Hauptkonto');
  assert.deepEqual(doc.snapshots.map(s=>s.month),['2026-08','2026-10']);
});

test('a changed value in a month without data carries the other values forward instead of zeroing them',()=>{
  const a=context(fixture(),'2026-09');
  a.run("openAssetSheet('depot')");
  fillAsset(a,'depot',{name:'Depot',category:'etf'});a.el('f-depot').value='5.050';
  a.run('_submitSheet()');
  const s=snapshot(a,'2026-09');
  assert.equal(value(s,'depot'),5050);assert.equal(value(s,'konto'),1000);assert.equal(value(s,'kredit'),3000);
});

test('invalid amounts keep the sheet open, show an error and change nothing',()=>{
  const a=context();const before=a.storage.getItem(Data.KEY);
  a.run("openAssetSheet('konto')");
  fillAsset(a,'konto',{name:'Girokonto'});a.el('f-konto').value='12abc';
  a.run('_submitSheet()');
  assert.equal(a.storage.getItem(Data.KEY),before);
  assert.equal(a.run('_sheetOpen'),true);
  assert.match(a.el('dsError').textContent,/gültigen Betrag/);
});

test('month sheet records every value at once, including German thousands and decimals',()=>{
  const a=context(fixture(),'2026-11');
  a.context.rows={val:[{dataset:{msVal:'konto',kind:'a'},value:'1.400'},{dataset:{msVal:'depot',kind:'a'},value:'5250,75'},{dataset:{msVal:'kredit',kind:'l'},value:'2.600'}],qty:[]};
  a.run("document.querySelectorAll=sel=>sel.includes('data-ms-val')?rows.val:sel.includes('data-ms-qty')?rows.qty:[]");
  a.run('openMonthSheet();_submitSheet()');
  const s=snapshot(a,'2026-11');
  assert.equal(value(s,'konto'),1400);assert.equal(value(s,'depot'),5250.75);assert.equal(value(s,'kredit'),2600);
  assert.equal(value(snapshot(a,'2026-10'),'konto'),1200);
});

test('month sheet is atomic: one invalid row stores nothing',()=>{
  const a=context(fixture(),'2026-11');const before=a.storage.getItem(Data.KEY);
  a.context.rows={val:[{dataset:{msVal:'konto',kind:'a'},value:'1.400'},{dataset:{msVal:'depot',kind:'a'},value:'-5'}],qty:[]};
  a.run("document.querySelectorAll=sel=>sel.includes('data-ms-val')?rows.val:sel.includes('data-ms-qty')?rows.qty:[]");
  a.run('openMonthSheet();_submitSheet()');
  assert.equal(a.storage.getItem(Data.KEY),before);
  assert.match(a.el('dsError').textContent,/Depot/);
});

test('loan sheet stores a manual balance; a complete contract derives it instead',()=>{
  const a=context();
  a.run("openLoanSheet('kredit')");
  a.el('f-kredit').value='2.500';
  a.run("document.querySelector=sel=>sel.includes('data-loan-name')?{value:'Autokredit'}:null");
  a.run('_submitSheet()');
  assert.equal(value(snapshot(a,'2026-10'),'kredit'),2500);
  const b=context();
  b.context.loanInputs=[['principal','10.000'],['rate','3'],['repayment','2'],['firstDue','01/26']].map(([k,v])=>({dataset:{loan:'kredit',k},value:v}));
  b.run("document.querySelector=sel=>sel.includes('data-loan-name')?{value:'Autokredit'}:null;document.querySelectorAll=sel=>sel.includes('data-loan=')?loanInputs:[]");
  b.run("openLoanSheet('kredit');_submitSheet()");
  const loan=b.json('appStorage.document()').loans.find(l=>l.positionId==='kredit');
  assert.equal(loan.principalAmount,10000);assert.equal(loan.firstPaymentMonth,'2026-01');
  assert.ok(b.json("loadData()['2026-10']._details.kredit")<10000);
});

test('a new liability with only a balance is created in its own section without touching assets',()=>{
  const a=context();
  a.run("document.querySelector=sel=>sel.includes('data-loan-name')?{value:'Privatdarlehen'}:null");
  a.run('openAddLiabSheet()');a.el('f-neu-kredit').value='4.000';
  a.run('_submitSheet()');
  const doc=a.json('appStorage.document()'),p=doc.positions.at(-1);
  assert.equal(p.category,'liab');assert.equal(p.name,'Privatdarlehen');
  const s=snapshot(a,'2026-10');assert.equal(value(s,p.id),4000);assert.equal(value(s,'konto'),1200);
});

test('removing a position from its sheet archives it and keeps its history in the backup',()=>{
  const a=context();a.run('confirm=()=>true');
  a.run("openAssetSheet('depot');_removeFromSheet('depot')");
  const doc=a.json('appStorage.document()');
  assert.equal(doc.positions.find(p=>p.id==='depot').archived,true);
  assert.equal(value(doc.snapshots[0],'depot'),5000);
  assert.equal(a.run('_sheetOpen'),false);
});

test('background quotes pause while a sheet is open',()=>{
  const a=context(fixture(),'2026-11');
  a.run("openAssetSheet('konto')");
  assert.equal(a.run('_isEditing()'),true);
  a.run('_closeSheet(true)');
  assert.equal(a.run('_isEditing()'),false);
});
