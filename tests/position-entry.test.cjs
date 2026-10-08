const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app}=require('./app-harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function context(){const a=app(html);a.run("selectedMonth='2026-10'");return a;}

test('Data always renders separate assets and liabilities, even without any positions',()=>{
  const a=context();a.run('buildDynamicFormForTest()');
  const form=a.el('dataPageContent').innerHTML;
  assert.match(form,/data-mod="assets"/);assert.match(form,/data-mod="liab"/);
  assert.match(form,/Noch keine Verbindlichkeiten/);
  assert.match(form,/id="newLiabLabel"/);
  assert.doesNotMatch(form,/<option value="liab">/);
});

test('adding editor contains only the new entry, with deletion remaining on existing rows',()=>{
  const a=context();
  a.run("_fc={fields:[{id:'custom-bank',label:'Mein Konto',category:'cash',displayGroup:'Cash',custom:true}]};buildDynamicFormForTest()");
  const form=a.el('dataPageContent').innerHTML;
  assert.match(form,/Mein Konto/);assert.match(form,/data-remove-field="custom-bank"/);
  const editor=a.run("_positionEditorHTML('assets')");
  assert.doesNotMatch(editor,/Mein Konto|customFieldsList|Verbindlichkeiten/);
  assert.doesNotMatch(a.run("_positionEditorHTML('liab')"),/id="newFieldCategory"/);
  assert.match(a.run("_positionEditorHTML('liab')"),/id="newLiabAsset"/);
});

test('new debts get the liability category and unique IDs; asset entry rejects a liability option',()=>{
  const a=context();a.run('_rebuildFormKeepingEdits=()=>{}');
  a.el('newFieldLabel').value='Konto';a.el('newFieldCategory').value='liab';
  a.run('addCustomField()');assert.equal(a.json('appStorage.document().positions.length'),0);
  a.el('newFieldCategory').value='cash';a.run('addCustomField()');
  a.el('newLiabLabel').value='Immobilienkredit';a.run("addCustomField('liab')");
  a.el('newLiabLabel').value='Autokredit';a.run("addCustomField('liab')");
  const positions=a.json('appStorage.document().positions');
  assert.deepEqual(positions.map(p=>p.category),['cash','liab','liab']);
  assert.equal(new Set(positions.map(p=>p.id)).size,3);
});

test('liabilities remain active when assets are disabled',()=>{
  const a=context();
  a.run("appStorage.setItem(V2_MODS_KEY,JSON.stringify({assets:false,liab:true}));_modsCache=null;_fc={fields:[{id:'cash',category:'cash'},{id:'debt',category:'liab'}]}");
  assert.deepEqual(a.json('_vf().map(f=>f.id)'),['debt']);
});

test('rebuilding after adding a position retains unsaved balances and loan terms',()=>{
  const a=context();
  let inputs=[{id:'f-debt',value:'200.000'}],loans=[{dataset:{loan:'debt',k:'rate'},value:'3,25'}];
  a.el('page-import').querySelectorAll=selector=>selector==='input.num-input'?inputs:selector==='input[data-loan][data-k]'?loans:[];
  a.context.resetInputs=()=>{inputs=[{id:'f-debt',value:''}];loans=[{dataset:{loan:'debt',k:'rate'},value:''}];};
  a.el('fieldEditorPanel').style.display='none';a.el('liabFieldEditorPanel').style.display='none';
  a.run('buildDynamicForm=resetInputs;_editMode=true;_rebuildFormKeepingEdits()');
  assert.equal(inputs[0].value,'200.000');assert.equal(loans[0].value,'3,25');
});
