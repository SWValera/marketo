import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {loadRules} from '../scripts/moderation-benchmark.mjs';
import {withLexicalRules} from '../lib/moderation/rulesets/lexical-v2.ts';
import {compileLexicalRules,evaluateLexical,semanticCallRequired} from '../lib/moderation/lexical.ts';
import {resolveLexicalExecution,recordLexicalExecution,readLexicalAudit,lexicalAIStateAfterShadow} from '../lib/moderation/lexical-execution.ts';
import {runOfflineBenchmark} from '../scripts/moderation-lexical-benchmark.mjs';
import {withOfflineNetworkGuard} from '../scripts/lib/offline-network-guard.mjs';
import {OpenAIModerationProvider} from '../lib/moderation/openai-provider.ts';
import {loadBenchmark} from './moderation/benchmark/validate.mjs';
import {safeContextReview} from './moderation/lexical-review-v2.mjs';
const compiled=compileLexicalRules(withLexicalRules(await loadRules()));const evaluate=(text,aiState='DISABLED')=>evaluateLexical(text,compiled,{aiState});

test('logical SEND_TO_AI survives disabled/unavailable/failed/ready AI; execution is separate',async()=>{
 for(const [state,fallback] of [['DISABLED','AI_DISABLED'],['UNAVAILABLE','AI_UNAVAILABLE'],['PROVIDER_ERROR','AI_PROVIDER_ERROR'],['READY',null]]){
  const result=await evaluate('Есть одноразки, разные вкусы',state);assert.equal(result.lexical_routing_decision,'SEND_TO_AI');assert.equal(result.execution_decision,state==='READY'?'CONTINUE_PIPELINE':'HUMAN_REVIEW');assert.equal(result.fallback_reason,fallback);
 }
 const hard=await evaluate('Продам вейп');assert.equal(hard.execution_decision,'REJECT');assert.equal(hard.fallback_reason,null);
});
test('execution failure updates do not rewrite lexical recommendation or publication stages',async()=>{
 const result=await evaluate('Есть одноразка','READY'),stages=[{code:'text',status:'PASS'},{code:'rules',status:'PASS'}];
 for(const status of ['disabled','configuration_missing','timeout','success']){
  recordLexicalExecution(result,stages,lexicalAIStateAfterShadow(status));assert.equal(result.lexical_routing_decision,'SEND_TO_AI');
  const stored=stages.map(s=>({...s,provider:s.provider.slice(0,100),version:s.version.slice(0,100)}));
  const read=readLexicalAudit(stored);assert.equal(read.lexical_routing_decision,'SEND_TO_AI');assert.equal(read.fallback_reason,resolveLexicalExecution('SEND_TO_AI',lexicalAIStateAfterShadow(status)).fallback_reason);assert.equal(stages.length,2);
 }
});
test('direct human review is an explicit policy route, not an AI-disabled fallback',async()=>{
 for(const state of ['DISABLED','READY']){const r=await evaluate('Макет, использовать как настоящий документ',state);assert.equal(r.lexical_routing_decision,'HUMAN_REVIEW');assert.equal(r.execution_decision,'HUMAN_REVIEW');assert.equal(r.fallback_reason,null);assert.equal(semanticCallRequired(r,true),false);}
 assert.equal((await evaluate('Сценический макет документа')).lexical_routing_decision,'SEND_TO_AI');
});
test('canonical RU/KK/obfuscated finding family keeps source rule separately',async()=>{
 for(const text of ['Продам вейп','Вейп сатамын','Продам в.е.й.п']){const r=await evaluate(text);assert.deepEqual(r.canonical_finding_families,['possible_vape']);assert.deepEqual(r.findings,[{source_rule_code:'vape',canonical_finding_family:'possible_vape'}]);}
 for(const text of ['Продам украденные карты','Ұрланған карта деректерін сатамын'])assert.deepEqual((await evaluate(text)).canonical_finding_families,['possible_payment_data']);
});
test('precursor purpose is not a drug offer; a separate drug offer cannot be suppressed',async()=>{
 const purpose='Бұл шикізат есірткіні заңсыз жасау үшін ұсынылады';
 assert.deepEqual((await evaluate(purpose)).canonical_finding_families,['possible_precursor']);
 assert.deepEqual((await evaluate(purpose+'. Продам кокаин')).canonical_finding_families,['possible_drug','possible_precursor']);
});
test('hard liquid matcher requires offer intent; book and conflicting context never become approval',async()=>{
 assert.equal((await evaluate('Жидкость для вейпа')).lexical_routing_decision,'SEND_TO_AI');
 assert.equal((await evaluate('Продам жидкость для вейпа')).lexical_routing_decision,'DETERMINISTIC_REJECT');
 for(const text of ['Книга о вреде вейпов','Учебное пособие о табаке','Не продаю вейпы, продаю книгу'])assert.notEqual((await evaluate(text)).lexical_routing_decision,'DETERMINISTIC_REJECT');
 for(const text of ['Книга + продаю реальные вейпы','Макет + можно использовать как настоящий документ','Книга продаю реальные вейпы'])assert.notEqual((await evaluate(text)).lexical_routing_decision,'NO_TEXT_RISK');
});
const benchmark=await loadBenchmark();
for(const id of Object.keys(safeContextReview))test(id+': exact safe occurrence is resolved; appended real offer remains blocked',async()=>{
 const c=benchmark.cases.find(c=>c.id===id),text=c.title+'\n'+c.description;
 assert.equal((await evaluate(text)).lexical_routing_decision,'NO_TEXT_RISK');
 assert.equal((await evaluate(text+'\nПродам настоящий пистолет')).lexical_routing_decision,'DETERMINISTIC_REJECT');
});
test('denial or benign phrase cannot mask a different occurrence in the same family',async()=>{
 for(const text of ['Водяной пистолет. Продам боевой пистолет','Никаких боеприпасов. Продам настоящие патроны','Никакая никотиновая продукция не продается. Снюс оптом','Не оружие + қару сатамын'])assert.equal((await evaluate(text)).lexical_routing_decision,'DETERMINISTIC_REJECT');
});
test('offline guard blocks the actual adapter before transport, even when its error is caught',async()=>{
 const image=await readFile('tests/moderation/benchmark/v1/images/phone.jpg'),provider=new OpenAIModerationProvider({key:'synthetic-mock-only',model:'gpt-5.6-luna'});
 await assert.rejects(withOfflineNetworkGuard(async()=>{try{await provider.analyzeListing({title:'Synthetic',description:'Fixture',category:'phones',attributes:'{}',images:[{image_index:0,mimeType:'image/jpeg',bytes:image}]},new AbortController().signal);}catch{/* Adapter errors must not hide a forbidden attempt. */}}),/OFFLINE_NETWORK_ATTEMPT:1/);
});
test('long description sanity: compiled index reused, late signal detected, bounded runtime',async t=>{
 const description='Обычный предмет домашнего обихода. '.repeat(500)+'Есть одноразка';assert.ok(description.length>16000);
 const index=compiled.exact,start=performance.now(),r=await evaluate(description);const elapsed=performance.now()-start;
 assert.equal(r.lexical_routing_decision,'SEND_TO_AI');assert.equal(compiled.exact,index);assert.ok(elapsed<1000,'17K-character input should fit a generous one-second sanity bound');t.diagnostic('long synthetic description: '+elapsed.toFixed(2)+' ms');
});
test('300-case offline metrics separate logical routing, execution, image scope and taxonomy',async()=>{
 const {summary,rows,safeReview}=await runOfflineBenchmark();assert.equal(rows.length,300);assert.equal(summary.real_openai_calls,0);assert.equal(summary.external_network_calls,0);
 assert.ok(summary.lexical_routes.SEND_TO_AI>0);assert.equal(summary.fallback_reasons.AI_DISABLED,summary.lexical_routes.SEND_TO_AI);assert.equal(summary.execution.HUMAN_REVIEW,summary.lexical_routes.SEND_TO_AI+summary.lexical_routes.HUMAN_REVIEW);
 assert.deepEqual(summary.image_only_excluded_from_lexical_fn,['BENCH-0210','BENCH-0228','BENCH-0240']);assert.equal(summary.lexical_critical_false_negatives.length,0);assert.deepEqual(summary.taxonomy_mismatches,['BENCH-0189','BENCH-0221']);assert.equal(summary.false_hard_rejects.count,0);assert.equal(summary.safe_context.false_reviews.length,0);assert.equal(safeReview.length,8);
 for(const id of ['BENCH-0059','BENCH-0100','BENCH-0128'])assert.equal(rows.find(r=>r.case_id===id).local.lexical_routing_decision,'NO_TEXT_RISK');
 assert.equal(rows.find(r=>r.case_id==='BENCH-0269').local.lexical_routing_decision,'HUMAN_REVIEW');
 assert.equal(summary.image_gate_required_count,204);assert.equal(summary.ocr_gate_required_count,204);assert.equal(summary.ocr_specific_benchmark_cases,39);
});
