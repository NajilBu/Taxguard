(function(root){
  'use strict';
  const expandedMonths=['Jan','Feb','Apr','May','Jul','Aug','Oct','Nov'];
  function forYear(client,year){
    const profile=client.yearProfiles?.[year];
    if(profile)return {...client,...profile,id:client.id};
    const previous=Object.keys(client.yearProfiles||{}).map(Number).filter(y=>y<year).sort((a,b)=>b-a)[0];
    if(!previous)return client;
    const source=client.yearProfiles[previous];
    const inherited={...client,...source,id:client.id,forms:[...source.forms],periods:JSON.parse(JSON.stringify(source.periods||{})),inheritedFrom:previous};
    if(client.status!=='Active'||source.calendar==='fiscal'){
      inherited.forms=[];
      inherited.reviewReason=client.status!=='Active'?'Client status needs review before carrying requirements forward.':'Fiscal-year requirements need review.';
    }else if(['eight','mixedEight','osd'].includes(source.income)){
      inherited.income='unknown';
      inherited.percentage='unknown';
      inherited.forms=inherited.forms.filter(code=>!['1701','1701A','2551-Q'].includes(code));
      inherited.reviewReason='Confirm this year’s income-tax election, annual return and percentage-tax requirements.';
    }else if(!source.calendar||source.calendar==='unknown'||!source.income||source.income==='unknown'){
      inherited.reviewReason='Recurring forms carried forward; confirm this year’s registration and requirements.';
    }
    return inherited;
  }
  function suggest(profile,year,catalog){
    const suggestions=[],warnings=[];
    const add=(code,reason)=>{
      if(catalog.some(f=>f.id===code))suggestions.push({code,reason});
      else warnings.push(`Add ${code} to the form directory before assigning it.`);
    };
    if(year<2018||profile.calendar!=='calendar')return {suggestions,warnings:['Automatic suggestions require a calendar year from 2018 onward. Review requirements manually for this client.']};
    const individual=profile.type==='Sole proprietorship';
    const eight=['eight','mixedEight'].includes(profile.income);
    if(eight&&(!individual||profile.tax==='VAT'))return {suggestions,warnings:['The confirmed 8% election conflicts with this business or tax type. Correct the profile before applying suggestions.']};
    if(individual&&['itemized','osd','eight','mixed','mixedEight'].includes(profile.income)){
      add('1701-Q','Individual business/professional quarterly income tax.');
      add(['osd','eight'].includes(profile.income)?'1701A':'1701','Annual return based on the confirmed income treatment.');
    }else if(!individual&&profile.income==='regular'){
      add('1702-Q','Confirmed regular corporate/ordinary partnership income tax.');
      add('1702-RT','Confirmed regular-rate annual income tax return.');
    }else warnings.push('Income tax treatment is unconfirmed or special. Select income tax forms manually.');
    if(year>2026)warnings.push('Review future-year requirements against BIR updates before saving.');
    if(profile.tax==='VAT'){
      add('2550-Q','VAT registration.');
      if(year<2023)warnings.push('This historical VAT year also needs a manual review of monthly VAT declarations; the quarterly suggestion is not a complete historical assignment.');
    }
    else if(eight)warnings.push('2551-Q is not suggested for the confirmed 8% election. Review any existing percentage-tax assignment; it is not removed automatically.');
    else if(profile.percentage==='yes')add('2551-Q','Confirmed percentage tax obligation under Section 116.');
    else if(profile.percentage!=='no')warnings.push('NVAT alone does not establish percentage-tax liability. Confirm it against registration.');
    if(profile.compensation==='yes'){
      add('1601-C','Confirmed compensation withholding registration.');
      add('1604-C','Annual compensation withholding information return.');
    }
    if(profile.expanded==='yes'){
      add('0619-E','Expanded withholding: first two months of each quarter.');
      add('1601-EQ','Quarterly expanded withholding return.');
      add('1604-E','Annual expanded withholding information return.');
    }
    if(profile.compensation==='unknown'||profile.expanded==='unknown')warnings.push('Unconfirmed withholding registrations require manual review.');
    warnings.push('Suggestions add to your selection. Review existing forms, special taxes and annual-return alternatives before saving.');
    return {suggestions,warnings};
  }
  function rolloverPlan(state,sourceYear){
    if(!Number.isInteger(sourceYear)||sourceYear<1000||sourceYear>=9998)throw Error('Choose a source year between 1000 and 9997.');
    const targetYear=sourceYear+1;
    return state.clients.map(client=>{
      const source=forYear(client,sourceYear);
      let reason='';
      if(client.yearProfiles?.[targetYear])reason='Target year already configured';
      else if(Object.keys(state.filings).some(k=>k.startsWith(client.id+':'+targetYear+':')))reason='Target year has recorded filings';
      else if(client.status!=='Active')reason='Client is not active — review manually';
      else if(client.start>sourceYear+'-12-31')reason='Client starts after the source year';
      else if(!source.forms.length)reason='No source-year requirements';
      else if(['eight','mixedEight','osd'].includes(source.income))reason='Annual election: configure the target year in Edit client';
      else if(source.calendar==='fiscal')reason='Fiscal year requires manual review';
      const profile={type:source.type,tax:source.tax,forms:[...source.forms],periods:JSON.parse(JSON.stringify(source.periods||{}))};
      for(const field of ['calendar','income','percentage','compensation','expanded'])if(source[field])profile[field]=source[field];
      return {id:client.id,name:client.name,sourceYear,targetYear,profile,reason};
    });
  }
  function rollover(state,sourceYear,selectedIds){
    const plan=rolloverPlan(state,sourceYear),ids=new Set(selectedIds);
    if(!ids.size)throw Error('Select at least one reviewed client.');
    if([...ids].some(id=>!plan.some(row=>row.id===id&&!row.reason)))throw Error('A selected client is no longer eligible. Reopen the rollover review.');
    return {...state,clients:state.clients.map(client=>{
      if(!ids.has(client.id))return client;
      const row=plan.find(row=>row.id===client.id);
      return {...client,yearProfiles:{...client.yearProfiles,[row.targetYear]:row.profile}};
    })};
  }
  const api={forYear,suggest,expandedMonths,rolloverPlan,rollover};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaxGuardAllocation=api;
})(typeof window==='object'?window:globalThis);
