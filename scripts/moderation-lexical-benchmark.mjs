// OFFLINE ONLY: no provider, R2, Supabase client or remote preview is constructed.
import {writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {loadBenchmark} from '../tests/moderation/benchmark/validate.mjs';
import {loadRules} from './moderation-benchmark.mjs';
import {withLexicalRules,lexicalInventory} from '../lib/moderation/rulesets/lexical-v2.ts';
import {withLexicalRules as withPreviousRules} from '../lib/moderation/rulesets/lexical-v1.ts';
import {compileLexicalRules,evaluateLexical} from '../lib/moderation/lexical.ts';
import {findingFamilies} from '../lib/moderation/finding-taxonomy.ts';
import {withOfflineNetworkGuard} from './lib/offline-network-guard.mjs';
import {reviewedBenchmarkSHA,imageOnlyCriticalCases,safeContextReview} from '../tests/moderation/lexical-review-v2.mjs';
const semantic=new Set(Object.values(findingFamilies));
const routes=['DETERMINISTIC_REJECT','SEND_TO_AI','HUMAN_REVIEW','NO_TEXT_RISK'];
const distribution=(rows,field,values)=>Object.fromEntries(values.map(v=>[v,rows.filter(r=>r.local[field]===v).length]));
const routeCounts=rows=>distribution(rows,'lexical_routing_decision',routes);
export async function runOfflineBenchmark(){return withOfflineNetworkGuard(async()=>{
 const benchmark=await loadBenchmark();if(benchmark.manifest.cases_sha256!==reviewedBenchmarkSHA)throw Error('Evaluation scope needs re-review');
 const seed=await loadRules(),compiled=compileLexicalRules(withLexicalRules(seed)),previous=compileLexicalRules(withPreviousRules(seed)),rows=[],safeReview=[];const start=performance.now();
 for(const c of benchmark.cases){
  const text=[c.title,c.description,JSON.stringify(c.attributes)].join('\n'),local=await evaluateLexical(text,compiled,{aiState:'DISABLED'});
  const actual=local.canonical_finding_families,expected=c.expected_findings.filter(code=>semantic.has(code));
  const applicable=!imageOnlyCriticalCases.includes(c.id),missing=c.critical_expected_findings.filter(code=>!actual.includes(code));
  rows.push({case_id:c.id,language:c.language,difficulty:c.difficulty,expected_decision:c.expected_decision,expected_findings:c.expected_findings,local_findings:actual,expected_lexical_families:expected,missing_lexical_findings:expected.filter(code=>!actual.includes(code)),critical_missing:missing,evaluation_scope:applicable?'TEXT_APPLICABLE':'TEXT_LAYER_NOT_APPLICABLE',taxonomy_mismatch:applicable&&missing.length>0&&local.lexical_routing_decision==='DETERMINISTIC_REJECT',lexical_critical_false_negative:applicable&&missing.length>0&&local.lexical_routing_decision!=='DETERMINISTIC_REJECT',requires_image:c.requires_image,requires_ocr:c.requires_ocr,tags:c.tags,local});
  if(safeContextReview[c.id]){const before=await evaluateLexical(text,previous);safeReview.push({case_id:c.id,...safeContextReview[c.id],before:{hard:before.matched_hard_patterns,suspicious:before.matched_suspicious_patterns,exceptions:before.matched_exception_patterns},after:{route:local.lexical_routing_decision,execution:local.execution_decision,hard:local.matched_hard_patterns,suspicious:local.matched_suspicious_patterns,exceptions:local.matched_exception_patterns}});}
 }
 const applicable=rows.filter(r=>r.evaluation_scope==='TEXT_APPLICABLE'),falseHard=rows.filter(r=>r.local.lexical_routing_decision==='DETERMINISTIC_REJECT'&&r.expected_decision!=='REJECT');
 const safe=rows.filter(r=>r.expected_decision==='APPROVE'&&r.tags.includes('context')),eligible=applicable.filter(r=>r.expected_lexical_families.length);
 const tp=applicable.reduce((n,r)=>n+r.expected_lexical_families.filter(c=>r.local_findings.includes(c)).length,0),fn=applicable.reduce((n,r)=>n+r.missing_lexical_findings.length,0);
 const ids=rs=>rs.map(r=>r.case_id),matches=eligible.filter(r=>r.expected_lexical_families.length===r.local_findings.length&&r.missing_lexical_findings.length===0);
 const summary={label:'OFFLINE SYNTHETIC LEXICAL BENCHMARK — not final moderation accuracy',cases:rows.length,...lexicalInventory(),real_openai_calls:0,external_network_calls:0,ai_state:'DISABLED',
  lexical_routes:routeCounts(rows),execution:distribution(rows,'execution_decision',['REJECT','HUMAN_REVIEW','CONTINUE_PIPELINE']),fallback_reasons:distribution(rows,'fallback_reason',[null,'AI_DISABLED','AI_UNAVAILABLE','AI_PROVIDER_ERROR']),
  expected_reject:{caught:rows.filter(r=>r.expected_decision==='REJECT'&&r.local.lexical_routing_decision==='DETERMINISTIC_REJECT').length,total:rows.filter(r=>r.expected_decision==='REJECT').length,not_hard_rejected_ids:ids(rows.filter(r=>r.expected_decision==='REJECT'&&r.local.lexical_routing_decision!=='DETERMINISTIC_REJECT'))},
  image_only_excluded_from_lexical_fn:ids(rows.filter(r=>r.evaluation_scope==='TEXT_LAYER_NOT_APPLICABLE')),lexical_critical_false_negatives:ids(rows.filter(r=>r.lexical_critical_false_negative)),taxonomy_mismatches:ids(rows.filter(r=>r.taxonomy_mismatch)),
  taxonomy_family_exact_match:{matched:matches.length,eligible:eligible.length,mismatch_ids:ids(eligible.filter(r=>!matches.includes(r)))},false_hard_rejects:{count:falseHard.length,ids:ids(falseHard)},
  suspicious_detection_recall:{detected:tp,expected:tp+fn,value:tp+fn?tp/(tp+fn):null,scope:'canonical lexical families, excluding reviewed image-only evidence'},
  safe_context:{cases:safe.length,hard_rejected:safe.filter(r=>r.local.lexical_routing_decision==='DETERMINISTIC_REJECT').length,false_reviews:ids(safe.filter(r=>['HUMAN_REVIEW','SEND_TO_AI'].includes(r.local.lexical_routing_decision)))},
  obfuscation:{total:rows.filter(r=>r.tags.includes('obfuscation')).length,detected:rows.filter(r=>r.tags.includes('obfuscation')&&r.local.matched_rule_codes.length>0).length,marked_obfuscated:rows.filter(r=>r.tags.includes('obfuscation')&&r.local.obfuscation_detected).length},
  languages:Object.fromEntries(['RU','KK','MIXED_RU_KK'].map(k=>[k,{total:rows.filter(r=>r.language===k).length,...routeCounts(rows.filter(r=>r.language===k))}])),difficulty:Object.fromEntries(['EASY','MEDIUM','HARD'].map(k=>[k,{total:rows.filter(r=>r.difficulty===k).length,...routeCounts(rows.filter(r=>r.difficulty===k))}])),
  text_semantic_ai_required:rows.filter(r=>r.local.lexical_routing_decision==='SEND_TO_AI').length,text_semantic_ai_not_required:rows.filter(r=>r.local.lexical_routing_decision!=='SEND_TO_AI').length,
  image_gate_required_count:rows.filter(r=>r.requires_image&&r.local.lexical_routing_decision!=='DETERMINISTIC_REJECT').length,
  // Every retained image requires OCR in the real pipeline; requires_ocr only
  // labels benchmark scenarios that specifically exercise textual image evidence.
  ocr_gate_required_count:rows.filter(r=>r.requires_image&&r.local.lexical_routing_decision!=='DETERMINISTIC_REJECT').length,ocr_specific_benchmark_cases:rows.filter(r=>r.requires_ocr&&r.local.lexical_routing_decision!=='DETERMINISTIC_REJECT').length,
  elapsed_ms:performance.now()-start,cases_sha256:benchmark.manifest.cases_sha256,labels_modified:false};
 return {summary,rows,safeReview};
});}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await runOfflineBenchmark(),dir='artifacts/moderation-lexical-v2';await mkdir(dir,{recursive:true});
 await writeFile(dir+'/results.jsonl',result.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');await writeFile(dir+'/metrics.json',JSON.stringify(result.summary,null,2)+'\n');await writeFile(dir+'/safe-context-review.json',JSON.stringify(result.safeReview,null,2)+'\n');console.log(JSON.stringify(result.summary,null,2));
 if(result.summary.cases!==300||result.summary.false_hard_rejects.count)process.exitCode=1;
}
