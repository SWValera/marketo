import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import sharp from 'sharp';
import {loadBenchmark,validateCases} from './moderation/benchmark/validate.mjs';
import {summarize} from './moderation/benchmark/contract.mjs';
import {parseOptions,selectCases,sanitizedResult,metrics} from '../scripts/lib/moderation-benchmark-core.mjs';
import {reserve,readLedger,saveLedger} from '../scripts/lib/moderation-benchmark-budget.mjs';
import {evaluateBenchmarkCase} from '../scripts/lib/moderation-benchmark-evaluate.mjs';
import {loadRules} from '../scripts/moderation-benchmark.mjs';
import {cleanObservation} from './helpers/moderation-ai-fixtures.mjs';
import {hashTinyPng,hammingDistance} from '../lib/moderation/perceptual-hash.ts';
const b=await loadBenchmark();
test('300 immutable synthetic fixtures, exact distributions and valid image/codes',()=>{
 assert.equal(b.cases.length,300);assert.equal(new Set(b.cases.map(c=>c.id)).size,300);
 assert.deepEqual(b.summary.decisions,{APPROVE:130,NEEDS_FIX:50,REJECT:60,HUMAN_REVIEW:60});assert.deepEqual(b.summary.languages,{RU:150,KK:90,MIXED_RU_KK:60});assert.deepEqual(b.summary.difficulty,{EASY:100,MEDIUM:120,HARD:80});
 assert.equal(Object.keys(b.images).length,52);assert.ok(new Set(b.cases.filter(c=>c.expected_decision==='APPROVE').map(c=>c.category_slug)).size>=15);
});
test('validator rejects duplicate ids, wrong counts, unknown codes, production identifiers and secrets',()=>{
 for(const patch of [{title:''},{expected_findings:['fake_code']},{description:'https://jevu.kz/listing/real'},{description:'actual@example.com'},{description:'Contact +7 777 123 45 67'},{description:'sk-proj-syntheticcredentialonly1234'},{description:'00000000-0000-4000-8000-000000000001'},{expected_decision:'REJECT'}]){
  const cases=structuredClone(b.cases);Object.assign(cases[0],patch);assert.throws(()=>validateCases(cases));
 }
 const cases=structuredClone(b.cases);cases[1].id=cases[0].id;assert.throws(()=>validateCases(cases));
});
test('offline filters, bounds, explicit real opt-in and fixed stratified sample',async()=>{
 assert.equal(parseOptions([]).dryRun,true);assert.equal(selectCases(b.cases,parseOptions(['--limit','2','--offset','5']))[0].id,'BENCH-0006');
 for(const [arg,value,field] of [['--language','KK','language'],['--difficulty','HARD','difficulty'],['--expected-decision','NEEDS_FIX','expected_decision']])assert.ok(selectCases(b.cases,parseOptions([arg,value])).every(c=>c[field]===value));
 assert.equal(selectCases(b.cases,parseOptions(['--ids','BENCH-0300']))[0].id,'BENCH-0300');
 for(const args of [['--real','--limit','31'],['--limit','0'],['--offset','-1'],['--ids','BENCH-0001,BENCH-0001']])assert.throws(()=>parseOptions(args));
 const sample=JSON.parse(await readFile(join(b.root,'first-run-30.json'))),chosen=selectCases(b.cases,{...parseOptions([]),ids:sample.ids}),counts=summarize(chosen);
 assert.equal(chosen.length,30);assert.deepEqual(counts.decisions,sample.expected_distribution);assert.deepEqual(counts.languages,sample.language_distribution);assert.deepEqual(counts.difficulty,sample.difficulty_distribution);
 for(const tag of ['ocr','images','obfuscation','prompt_injection','category_mismatch','duplicate'])assert.ok(counts[tag]>0);
});
test('result allowlist removes raw prompts, OCR, PII, secrets and unsafe model strings',()=>{
 const c=b.cases[0],r=sanitizedResult(c,{provider_status:'success',schema_valid:true,shadow_recommendation:'SHADOW_APPROVE',actual_findings:['possible_vape','sk-proj-syntheticsecret'],raw:'4242 4242 4242 4242',prompt:'NEVER_STORE_ME',model:'sk-proj-syntheticsecret',final_decision:'APPROVED'});
 assert.ok(!/4242|NEVER_STORE|sk-proj/.test(JSON.stringify(r)));assert.equal(r.model,null);assert.equal(r.final_decision,'HUMAN_REVIEW');assert.deepEqual(r.actual_findings,['possible_vape']);
});
test('metrics never count provider failure as a matching review; critical AI misses remain visible',()=>{
 const safe=b.cases[0],critical=b.cases.find(c=>c.critical_expected_findings.length),human=b.cases.find(c=>c.expected_decision==='HUMAN_REVIEW');
 const rows=[sanitizedResult(safe,{provider_status:'success',schema_valid:true,shadow_recommendation:'SHADOW_APPROVE',actual_findings:[],actual_calls:1,latency_ms:100,input_tokens:5,output_tokens:2}),sanitizedResult(critical,{provider_status:'success',schema_valid:true,shadow_recommendation:'SHADOW_REJECT',actual_findings:critical.expected_findings,ai_findings:[]}),sanitizedResult(human,{provider_status:'invalid_schema',shadow_recommendation:'SHADOW_HUMAN_REVIEW'})];
 const m=metrics(rows);assert.equal(m.exact_decision_match.matched,2);assert.equal(m.per_decision.HUMAN_REVIEW.matched,0);assert.deepEqual(m.critical_false_negatives.ids,[critical.id]);assert.equal(m.schema_failures,1);assert.equal(m.total_input_tokens,5);assert.equal(m.missing_usage_rows,2);
});
test('durable budget reserves before network, max 30 initial/10 rerun, two per case, daily 50',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jevu-benchmark-budget-'));
 try{const ledger=await readLedger(dir);ledger.prior=[{date:'2026-09-26',calls:5}];
 const entry=i=>({id:'BENCH-'+String(i).padStart(4,'0'),date:'2026-09-26',runId:'test',digest:'frozen'});
 for(let i=1;i<=30;i++)reserve(ledger,entry(i));await saveLedger(dir,ledger);assert.deepEqual(await readLedger(dir),ledger);
 assert.throws(()=>reserve(ledger,entry(31)));assert.throws(()=>reserve(ledger,{...entry(1),digest:'changed',rerun:'fix'}));
 for(let i=1;i<=10;i++)reserve(ledger,{...entry(i),rerun:'fix'});assert.equal(ledger.reservations.length,40);assert.throws(()=>reserve(ledger,{...entry(11),rerun:'fix'}));
 assert.throws(()=>reserve({prior:[{date:'2026-09-26',calls:50}],reservations:[]},entry(1)));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('all 20 duplicate fixtures: exact/resize/brightness/compression/different are measured, not fraud convictions',async()=>{
 const hashes=new Map();const hash=async ref=>{if(!hashes.has(ref)){const png=await sharp(await readFile(join(b.root,ref))).resize(9,8,{fit:'fill'}).png().toBuffer();hashes.set(ref,await hashTinyPng(png,new AbortController().signal));}return hashes.get(ref);};
 for(const c of b.cases.filter(c=>c.duplicate_expectation)){
  const d=hammingDistance(await hash(c.image_fixture_refs[0]),await hash(c.duplicate_reference_refs[0]));
  // Broad fixture relationship, not the production cutoff (3). The benchmark
  // must retain misses at that cutoff, including brightness changes.
  assert.ok(c.duplicate_expectation==='exact'?d===0:c.duplicate_expectation==='near'?d<=12:d>=20,c.id+' dHash distance '+d);assert.notEqual(c.expected_decision,'REJECT');
 }
});
const processor={input(stream){let transformation;return {transform(v){transformation=v;return this;},async output(opts){const bytes=await new Response(stream).arrayBuffer();let s=sharp(Buffer.from(bytes));if(transformation.width===9)s=s.resize(9,8,{fit:'fill'});const out=opts.format==='image/png'?await s.png().toBuffer():await s.jpeg({quality:75}).toBuffer();return {response:()=>new Response(out,{headers:{'content-type':opts.format}})};}};}};
test('isolated actual engine/adapter composition: OCR privacy, shadow only, no network or production DB',async()=>{
 const c=b.cases.find(c=>c.id==='BENCH-0131'),rules=await loadRules(),analysis=cleanObservation([0,1]);analysis.visible_text[1].text='TEST CARD 4242 4242 4242 4242';
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network access');};let calls=0;
 try{const result=await evaluateBenchmarkCase(c,{rules,processor,provider:{analyzeListing:async()=>{calls++;return {observations:analysis,metadata:{status:'success',model:'gpt-5.6-luna',latency_ms:10,input_tokens:2,output_tokens:3,image_count:1}};}},loadFixture:async ref=>{const m=Object.values(b.images).find(i=>i.file===ref);return {...m,bytes:await readFile(join(b.root,ref))};},signal:new AbortController().signal});
 assert.equal(calls,1);assert.ok(result.actual_findings.includes('payment_card'));assert.equal(result.ocr_check.privacy_detected,true);assert.equal(result.final_decision,'HUMAN_REVIEW');assert.ok(!JSON.stringify(result).includes('4242'));
 }finally{globalThis.fetch=originalFetch;}
});
