/* Derived history: contracts fill missing months without inventing stored prices. */
(function(root){
  'use strict';
  const Loan=typeof module!=='undefined'&&module.exports?require('./loan-model.js'):root.LoanModel;
  const copy=v=>JSON.parse(JSON.stringify(v));
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function build(raw,fields,params,through){
    const data=copy(raw),knownMonths=Object.keys(raw).sort();
    const configured=fields.filter(f=>f.category==='liab'&&Loan.configured(params[f.id]));
    const linked=configured.filter(f=>fields.some(a=>a.id===params[f.id].assetId&&a.category!=='liab'));
    const end=knownMonths.length&&knownMonths.at(-1)>through?knownMonths.at(-1):through;
    const starts=configured.map(f=>Loan.normalizeMonth(params[f.id].firstDue)).filter(m=>m<=end).sort();
    const generated=[],estimated=[];
    // Historical asset observations are used only as explicitly labelled estimates.
    const observations=new Map();
    for(const f of linked){
      const id=params[f.id].assetId;if(observations.has(id))continue;
      observations.set(id,knownMonths.filter(m=>own(raw[m]._details||{},id)).map(month=>({month,entry:raw[month]})));
    }
    if(starts.length){
      let previous=null,knownIndex=0;
      const start=starts[0];
      // Bound pathological dates, while covering the annuity model's 100-year horizon.
      const floor=Loan.addMonths(end,-1199),first=start<floor?floor:start;
      for(let month=first;month<=end;month=Loan.addMonths(month,1)){
        while(knownIndex<knownMonths.length&&knownMonths[knownIndex]<=month){previous=raw[knownMonths[knownIndex++]];}
        const isGenerated=!own(raw,month);
        const e=isGenerated?(previous?copy(previous):{_details:{},_units:{}}):data[month];
        e._details=e._details||{};e._units=e._units||{};
        const estimatedAssetIds=[],estimatedUnitKeys=[];
        for(const f of linked){
          const p=params[f.id],id=p.assetId;if(month<Loan.normalizeMonth(p.firstDue))continue;
          if(!isGenerated&&own(e._details,id))continue; // Explicit zero is an observation, too.
          const rows=observations.get(id)||[];
          const observation=rows.filter(r=>r.month<=month).at(-1)||rows[0];
          if(!observation)continue;
          e._details[id]=observation.entry._details[id];estimatedAssetIds.push(id);
          const asset=fields.find(a=>a.id===id),unit=asset.unitId||asset.id;
          if(asset.hasUnits&&own(observation.entry._units||{},unit)&&(isGenerated||!own(e._units,unit))){
            e._units[unit]=observation.entry._units[unit];estimatedUnitKeys.push(unit);
          }
        }
        if(isGenerated||estimatedAssetIds.length){
          e._loanHistory={generated:isGenerated,estimatedAssetIds:[...new Set(estimatedAssetIds)],estimatedUnitKeys:[...new Set(estimatedUnitKeys)]};
          if(isGenerated)generated.push(month);if(estimatedAssetIds.length)estimated.push(month);
        }
        data[month]=e;
      }
    }
    for(const [month,e] of Object.entries(data)){
      if(!configured.length)break;
      e._details=e._details||{};
      configured.forEach(f=>{e._details[f.id]=Loan.at(params[f.id],month).balance;});
      const totals={cash:0,etf:0,other:0,bav:0,illiquid:0,liab:0};
      fields.forEach(f=>{totals[f.category]=(totals[f.category]||0)+(+e._details[f.id]||0);});
      Object.assign(e,totals);
    }
    return {data,generated,estimated,start:starts[0]||null,end};
  }
  function stored(data,raw){
    const out={};
    for(const [month,entry] of Object.entries(data)){
      if(entry._loanHistory?.generated)continue;
      const e=copy(entry),meta=e._loanHistory;
      // Saving another month must not turn estimated prices into observations.
      for(const id of meta?.estimatedAssetIds||[])if(!own(raw[month]?._details||{},id))delete e._details[id];
      for(const id of meta?.estimatedUnitKeys||[])if(!own(raw[month]?._units||{},id))delete e._units[id];
      delete e._loanHistory;out[month]=e;
    }
    return out;
  }
  const api={build,stored};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LoanHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this);
