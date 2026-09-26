import {decisions,languages,difficulties,findingCodes,VERSION} from '../../tests/moderation/benchmark/contract.mjs';
const set=v=>new Set(v);
export function parseOptions(args){
 const options={limit:30,offset:0,dryRun:true,ids:null,language:null,difficulty:null,expectedDecision:null,sample:null,rerun:null};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--dry-run'){options.dryRun=true;continue;}
  if(arg==='--real'){options.dryRun=false;continue;}
  if(!['--limit','--offset','--ids','--language','--difficulty','--expected-decision','--sample','--rerun'].includes(arg))throw Error('Unknown benchmark option');
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing benchmark option value');
  if(['--limit','--offset'].includes(arg)){if(!/^\d+$/.test(value))throw Error('Invalid numeric option');options[arg.slice(2)]=Number(value);}
  else if(arg==='--ids'){options.ids=value.split(',');if(options.ids.some(v=>!/^BENCH-\d{4}$/.test(v))||set(options.ids).size!==options.ids.length)throw Error('Invalid or repeated ids');}
  else options[{'--language':'language','--difficulty':'difficulty','--expected-decision':'expectedDecision','--sample':'sample','--rerun':'rerun'}[arg]]=value;
 }
 if(options.limit<1||options.limit>300||options.offset<0||options.offset>299)throw Error('Selection bounds');
 for(const [key,values] of [['language',languages],['difficulty',difficulties],['expectedDecision',decisions]])if(options[key]&&!values.includes(options[key]))throw Error('Unknown '+key);
 if(options.sample&&options.sample!=='first-run-30')throw Error('Unknown frozen sample');
 if(options.sample&&options.ids)throw Error('Choose a sample OR explicit ids');
 if(!options.dryRun&&options.limit>(options.rerun?10:30))throw Error('Real run request cap exceeded');
 if(options.rerun&&!/^[a-zA-Z0-9_-]{7,80}$/.test(options.rerun))throw Error('Rerun needs a reviewed defect/commit reference');
 return options;
}
export function selectCases(cases,options){
 if(options.ids?.some(id=>!cases.some(c=>c.id===id)))throw Error('Unknown benchmark id');
 return cases.filter(c=>(!options.ids||options.ids.includes(c.id))&&(!options.language||c.language===options.language)&&(!options.difficulty||c.difficulty===options.difficulty)&&(!options.expectedDecision||c.expected_decision===options.expectedDecision)).slice(options.offset,options.offset+options.limit);
}
const number=v=>Number.isFinite(v)&&v>=0?v:null;
export function sanitizedResult(c,raw){
 const codes=values=>[...new Set((Array.isArray(values)?values:[]).filter(v=>findingCodes.includes(v)))].sort();
 const actual=codes(raw.actual_findings),expected=codes(c.expected_findings);
 const validShadow=['SHADOW_APPROVE','SHADOW_NEEDS_FIX','SHADOW_REJECT','SHADOW_HUMAN_REVIEW'];
 const status=['success','timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','content_unavailable','configuration_missing','provider_4xx','budget_exhausted','transport_error','technical_failure'].includes(raw.provider_status)?raw.provider_status:'invalid_schema';
 const shadow=validShadow.includes(raw.shadow_recommendation)?raw.shadow_recommendation:'SHADOW_HUMAN_REVIEW';
 const schemaValid=raw.schema_valid===true&&status==='success';
 const aiFindings=codes(raw.ai_findings);
 return {case_id:c.id,benchmark_version:VERSION,expected_decision:c.expected_decision,shadow_recommendation:shadow,
  expected_findings:expected,actual_findings:actual,missing_findings:expected.filter(f=>!actual.includes(f)),unexpected_findings:actual.filter(f=>!expected.includes(f)),forbidden_findings_triggered:actual.filter(f=>c.forbidden_findings.includes(f)),
  critical_missing_findings:c.critical_expected_findings.filter(f=>!aiFindings.includes(f)),ai_findings:aiFindings,
  latency_ms:number(raw.latency_ms),input_tokens:number(raw.input_tokens),output_tokens:number(raw.output_tokens),image_count:Number.isInteger(raw.image_count)&&raw.image_count>=0?raw.image_count:c.image_fixture_refs.length,
  schema_valid:schemaValid,provider_status:status,http_status:Number.isInteger(raw.http_status)?raw.http_status:null,actual_calls:Number.isInteger(raw.actual_calls)&&raw.actual_calls>=0&&raw.actual_calls<=1?raw.actual_calls:null,
  provider:'openai',model:typeof raw.model==='string'&&/^gpt-[a-z0-9.-]{1,70}$/.test(raw.model)?raw.model:null,retry_count:0,
  schema_diagnostics:raw.schema_diagnostics?{structure_valid:raw.schema_diagnostics.structure_valid===true,index_contract_valid:raw.schema_diagnostics.index_contract_valid===true,complete:raw.schema_diagnostics.complete===true}:null,
  ocr_check:c.requires_ocr?{text_present:raw.ocr_check?.text_present===true,privacy_detected:raw.ocr_check?.privacy_detected===true,complete:raw.ocr_check?.complete===true}:null,
  duplicate_check:c.duplicate_expectation?{expected:c.duplicate_expectation,exact:raw.duplicate_check?.exact===true,similar:raw.duplicate_check?.similar===true,distance:number(raw.duplicate_check?.distance)}:null,
  final_decision:['HUMAN_REVIEW','REJECTED','NEEDS_FIX'].includes(raw.final_decision)?raw.final_decision:'HUMAN_REVIEW',production_records_created:0,
 };
}
export function metrics(results){
 const comparable=r=>r.schema_valid&&r.provider_status==='success';
 const match=r=>comparable(r)&&r.shadow_recommendation==='SHADOW_'+r.expected_decision;
 const per=Object.fromEntries(decisions.map(d=>{const rows=results.filter(r=>r.expected_decision===d);return [d,{matched:rows.filter(match).length,total:rows.length}];}));
 let tp=0,fp=0,fn=0;for(const r of results){tp+=r.actual_findings.filter(f=>r.expected_findings.includes(f)).length;fp+=r.unexpected_findings.length;fn+=r.missing_findings.length;}
 const critical=results.filter(r=>r.critical_missing_findings.length),latencies=results.map(r=>r.latency_ms).filter(v=>v!==null);
 const sum=key=>results.reduce((n,r)=>n+(r[key]??0),0);
 return {label:'SYNTHETIC BENCHMARK METRICS',total:results.length,exact_decision_match:{matched:results.filter(match).length,total:results.length},per_decision:per,
  findings:{true_positives:tp,false_positives:fp,false_negatives:fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null},
  critical_false_negatives:{cases:critical.length,ids:critical.map(r=>r.case_id),missing_observations:critical.reduce((n,r)=>n+r.critical_missing_findings.length,0)},
  false_positives:{finding_count:fp,case_ids:results.filter(r=>r.unexpected_findings.length).map(r=>r.case_id),forbidden_case_ids:results.filter(r=>r.forbidden_findings_triggered.length).map(r=>r.case_id),safe_decision_mismatches:results.filter(r=>r.expected_decision==='APPROVE'&&comparable(r)&&!match(r)).map(r=>r.case_id)},
  schema_failures:results.filter(r=>r.provider_status==='invalid_schema').length,provider_failures:results.filter(r=>!['success','invalid_schema'].includes(r.provider_status)).length,
  average_latency_ms:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null,total_input_tokens:sum('input_tokens'),total_output_tokens:sum('output_tokens'),
  missing_usage_rows:results.filter(r=>r.input_tokens===null||r.output_tokens===null).length,api_calls_known:sum('actual_calls'),api_calls_indeterminate:results.filter(r=>r.actual_calls===null).length,
 };
}
