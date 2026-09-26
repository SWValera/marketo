// OFFLINE ONLY. No provider, R2, Supabase client or remote preview is constructed.
import {writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {loadBenchmark} from '../tests/moderation/benchmark/validate.mjs';
import {loadRules} from './moderation-benchmark.mjs';
import {withLexicalRules,lexicalInventory} from '../lib/moderation/rulesets/lexical-v1.ts';
import {compileLexicalRules,evaluateLexical} from '../lib/moderation/lexical.ts';
const aliases={vape:'possible_vape',tobacco:'possible_tobacco',nicotine:'possible_nicotine_product',weapon:'possible_weapon',ammunition:'possible_ammunition',explosive:'possible_explosive',drugs:'possible_drug',illegal_precursors:'possible_precursor',forged_document:'possible_fake_document',stolen_payment_data:'stolen_payment_data',illegal_service:'possible_illegal_service',regulated:'uncertain',adult_content:'possible_adult_content'};
const semantic=new Set(Object.values(aliases).filter(c=>c!=='uncertain'));
const routes=['DETERMINISTIC_REJECT','SEND_TO_AI','HUMAN_REVIEW','NO_TEXT_RISK'];
const counts=rows=>Object.fromEntries(routes.map(r=>[r,rows.filter(x=>x.local.routing_decision===r).length]));
export async function runOfflineBenchmark(){
 const benchmark=await loadBenchmark(),compiled=compileLexicalRules(withLexicalRules(await loadRules()));const rows=[];const start=performance.now();
 for(const c of benchmark.cases){
  const local=await evaluateLexical([c.title,c.description,JSON.stringify(c.attributes)].join('\n'),compiled,{aiAvailable:false});
  const actual=local.finding_codes.map(code=>aliases[code]??code),expected=c.expected_findings.filter(code=>semantic.has(code));
  rows.push({case_id:c.id,language:c.language,difficulty:c.difficulty,expected_decision:c.expected_decision,expected_findings:c.expected_findings,local_findings:actual,missing_lexical_findings:expected.filter(code=>!actual.includes(code)),critical_missing:c.critical_expected_findings.filter(code=>!actual.includes(code)),requires_image:c.requires_image,requires_ocr:c.requires_ocr,tags:c.tags,local});
 }
 const critical=rows.filter(r=>r.critical_missing.length),falseHard=rows.filter(r=>r.local.routing_decision==='DETERMINISTIC_REJECT'&&r.expected_decision!=='REJECT');
 const safe=rows.filter(r=>r.expected_decision==='APPROVE'&&r.tags.includes('context'));
 const tp=rows.reduce((n,r)=>n+r.expected_findings.filter(c=>semantic.has(c)&&r.local_findings.includes(c)).length,0),fn=rows.reduce((n,r)=>n+r.missing_lexical_findings.length,0);
 const summary={label:'OFFLINE SYNTHETIC LEXICAL BENCHMARK — not final moderation accuracy',cases:rows.length,...lexicalInventory(),real_openai_calls:0,provider_available:false,routes:counts(rows),
  expected_reject:{caught:rows.filter(r=>r.expected_decision==='REJECT'&&r.local.routing_decision==='DETERMINISTIC_REJECT').length,total:rows.filter(r=>r.expected_decision==='REJECT').length,not_hard_rejected_ids:rows.filter(r=>r.expected_decision==='REJECT'&&r.local.routing_decision!=='DETERMINISTIC_REJECT').map(r=>r.case_id)},
  critical_detection_misses:{cases:critical.length,ids:critical.map(r=>r.case_id),missing_findings:critical.reduce((n,r)=>n+r.critical_missing.length,0)},false_hard_rejects:{count:falseHard.length,ids:falseHard.map(r=>r.case_id)},
  suspicious_detection_recall:{detected:tp,expected:tp+fn,value:tp+fn?tp/(tp+fn):null},
  safe_context:{cases:safe.length,hard_rejected:safe.filter(r=>r.local.routing_decision==='DETERMINISTIC_REJECT').length,routed_to_review:safe.filter(r=>['HUMAN_REVIEW','SEND_TO_AI'].includes(r.local.routing_decision)).map(r=>r.case_id)},
  obfuscation:{total:rows.filter(r=>r.tags.includes('obfuscation')).length,detected:rows.filter(r=>r.tags.includes('obfuscation')&&r.local.matched_rule_codes.length>0).length,marked_obfuscated:rows.filter(r=>r.tags.includes('obfuscation')&&r.local.obfuscation_detected).length,missed_ids:rows.filter(r=>r.tags.includes('obfuscation')&&!r.local.matched_rule_codes.length).map(r=>r.case_id)},
  languages:Object.fromEntries(['RU','KK','MIXED_RU_KK'].map(k=>[k,{total:rows.filter(r=>r.language===k).length,...counts(rows.filter(r=>r.language===k))}])),difficulty:Object.fromEntries(['EASY','MEDIUM','HARD'].map(k=>[k,{total:rows.filter(r=>r.difficulty===k).length,...counts(rows.filter(r=>r.difficulty===k))}])),
  text_semantic_ai_avoidable:rows.filter(r=>['DETERMINISTIC_REJECT','NO_TEXT_RISK'].includes(r.local.routing_decision)).length,image_ai_required_for_future_approval:rows.filter(r=>r.requires_image&&r.local.routing_decision!=='DETERMINISTIC_REJECT').length,
  elapsed_ms:performance.now()-start,cases_sha256:benchmark.manifest.cases_sha256,labels_modified:false};
 return {summary,rows};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 // Deliberate kill switch: even an accidental fetch in a dependency must fail.
 globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN_IN_OFFLINE_BENCHMARK');};
 const result=await runOfflineBenchmark();await mkdir('artifacts/moderation-lexical-v1',{recursive:true});
 await writeFile('artifacts/moderation-lexical-v1/results.jsonl',result.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');await writeFile('artifacts/moderation-lexical-v1/metrics.json',JSON.stringify(result.summary,null,2)+'\n');console.log(JSON.stringify(result.summary,null,2));
 if(result.summary.cases!==300||result.summary.false_hard_rejects.count)process.exitCode=1;
}
