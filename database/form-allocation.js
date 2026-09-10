(function(root){
  'use strict';
  const expandedMonths=['Jan','Feb','Apr','May','Jul','Aug','Oct','Nov'];
  function forYear(client,year){
    const profile=client.yearProfiles?.[year];
    return profile?{...client,...profile,id:client.id}:client;
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
  const api={forYear,suggest,expandedMonths};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaxGuardAllocation=api;
})(typeof window==='object'?window:globalThis);
