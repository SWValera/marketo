import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {caseSchema,summarize,VERSION} from './contract.mjs';
import {getCategoryBySlug} from '../../../lib/catalog-config.ts';
export const benchmarkRoot=resolve(dirname(fileURLToPath(import.meta.url)),'v1');
const sha=b=>createHash('sha256').update(b).digest('hex');
function requireThat(ok,message){if(!ok)throw Error('Benchmark invalid: '+message);}
export function validateCases(candidates,{full=true}={}){
 const cases=candidates.map((c,i)=>{const parsed=caseSchema.safeParse(c);requireThat(parsed.success,'case '+(i+1)+' schema');return parsed.data;});
 const seen=new Set(),content=new Set();
 for(const c of cases){
  requireThat(!seen.has(c.id),c.id+' duplicate id');seen.add(c.id);
  const signature=sha(c.title+'\n'+c.description);requireThat(!content.has(signature),c.id+' repeated listing text');content.add(signature);
  requireThat(Boolean(getCategoryBySlug(c.category_slug)),c.id+' unknown category');
  requireThat(c.requires_image===(c.image_fixture_refs.length>0),c.id+' image flag');
  requireThat(c.requires_ocr===c.tags.includes('ocr')&&(!c.requires_ocr||c.requires_image),c.id+' OCR flag');
  requireThat(Boolean(c.duplicate_reference_refs?.length)===c.tags.includes('duplicate'),c.id+' duplicate reference');
  requireThat(!c.expected_findings.some(f=>c.forbidden_findings.includes(f)),c.id+' contradictory labels');
  requireThat(c.critical_expected_findings.every(f=>c.expected_findings.includes(f))&&(!c.critical_expected_findings.length||c.expected_decision==='REJECT'),c.id+' critical label context');
  for(const field of ['expected_findings','forbidden_findings','tags'])requireThat(new Set(c[field]).size===c[field].length,c.id+' repeated '+field);
  const text=[c.title,c.description,JSON.stringify(c.attributes),c.rationale].join('\n');
  requireThat(!/(?:https?:\/\/|www\.|jevu\.kz|supabase\.(?:co|com)|[a-z\d._%+-]+@[a-z\d.-]+\.[a-z]{2,})/iu.test(text),c.id+' URL or contact address');
  requireThat(!/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i.test(text),c.id+' account-like UUID');
  requireThat(!/(?:\bsk-(?:proj-)?[\w-]{8,}|\beyJ[\w-]{15,}\.|(?:API_KEY|SECRET_KEY|DATABASE_URL|AUTHORIZATION)\s*[:=])/i.test(text),c.id+' credential-like content');
  const identifiers=text.replace(/TEST-ID-123456/g,'[TEST-ID]');
  requireThat(!/(?:\+7|8)[\s()-]*(?:\d[\s()-]*){10}\b|\b\d{10,19}\b|\b(?:\d[ -]?){12,19}\b/u.test(identifiers),c.id+' non-allowlisted identifier');
  if(c.language!=='RU')requireThat(/[әғқңөұүһі]/iu.test(c.title+' '+c.description),c.id+' missing Kazakh text');
 }
 const summary=summarize(cases);
 if(full){
  requireThat(cases.length===300,'case count');
  cases.forEach((c,i)=>requireThat(c.id==='BENCH-'+String(i+1).padStart(4,'0'),'stable sequential id at '+i));
  for(const [field,expected] of Object.entries({decisions:{APPROVE:130,NEEDS_FIX:50,REJECT:60,HUMAN_REVIEW:60},languages:{RU:150,KK:90,MIXED_RU_KK:60},difficulty:{EASY:100,MEDIUM:120,HARD:80}}))for(const [key,value] of Object.entries(expected))requireThat(summary[field][key]===value,field+' '+key+' count');
  for(const [tag,min] of Object.entries({ocr:25,obfuscation:30,prompt_injection:10,category_mismatch:20,duplicate:20}))requireThat(summary[tag]>=min,tag+' minimum');
 }
 return {cases,summary};
}
export async function loadBenchmark(root=benchmarkRoot){
 const source=await readFile(join(root,'cases.jsonl'),'utf8'),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 requireThat(manifest.benchmark_version===VERSION&&sha(source)===manifest.cases_sha256,'immutable case digest');
 let raw;try{raw=source.trim().split('\n').map(l=>JSON.parse(l));}catch{throw Error('Benchmark invalid: JSONL');}
 const result=validateCases(raw);
 const images=JSON.parse(await readFile(join(root,'images/manifest.json'),'utf8')).fixtures;
 for(const [name,entry] of Object.entries(images)){
  requireThat(entry.file==='images/'+name+'.jpg','fixture path');
  const bytes=await readFile(join(root,entry.file));
  requireThat(sha(bytes)===entry.sha256&&bytes[0]===255&&bytes[1]===216&&bytes.length<=512*1024,'fixture integrity '+name);
 }
 for(const c of result.cases)for(const ref of [...c.image_fixture_refs,...c.duplicate_reference_refs??[]])requireThat(Object.values(images).some(i=>i.file===ref),c.id+' missing image fixture');
 // Inspect readable vector sources as well as pinning all JPEG hashes.
 for(const name of (await readdir(join(root,'images'))).filter(n=>n.endsWith('.svg'))){
  const source=await readFile(join(root,'images',name),'utf8');
  requireThat(!/<(?:image|script|foreignObject)\b|(?:href|onload)\s*=/i.test(source),'external/executable SVG '+name);
  const visible=[...source.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(m=>m[1]).join('\n').replaceAll('4242 4242 4242 4242','[TEST-CARD]').replaceAll('TEST-ID-123456','[TEST-ID]');
  requireThat(!/\b\d{7,19}\b|\b(?:\d[ -]?){12,19}\b|@/u.test(visible),'non-test SVG identifier');
 }
 return {...result,root,manifest,images};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const b=await loadBenchmark();console.log(JSON.stringify({validator:'PASS',...b.summary,image_fixtures:Object.keys(b.images).length,cases_sha256:b.manifest.cases_sha256}));}catch(e){console.error(e.message);process.exitCode=1;}
}
