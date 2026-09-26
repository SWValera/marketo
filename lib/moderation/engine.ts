import { analysisSchema,ocrSchema,type Snapshot,type Rule,type Finding,type Stage,type FraudSignals,type ModerationResult,type Observation } from './contracts.ts';
import { containsCandidate,normalizeText,detectPersonalData,redactText } from './normalize.ts';
import { bounded,ProviderUnavailable,type ModerationAIProvider,type ModerationOCRProvider } from './providers.ts';
import { sanitizeProcessedJpeg } from '../media/processed-jpeg.ts';
import { validateListingImage } from '../media/image-validation.ts';
import {compileLexicalRules,evaluateLexical} from './lexical.ts';
import {recordLexicalExecution} from './lexical-execution.ts';
import type {LexicalAIState} from './lexical-contract.ts';

const review={ru:'Объявление требует дополнительной проверки.',kk:'Хабарландыру қосымша тексеруді қажет етеді.'};
export function finding(code:string,action:Finding['recommended_action'],source:Finding['source_type']='system',index?:number):Finding{
  const privacy=['personal_id','payment_card','document_visible'].includes(code);
  const ru=code==='category_mismatch'?'Описание не соответствует выбранной категории. Проверьте категорию и содержание.':code==='image_mismatch'?'Фотографии могут не соответствовать описанию. Проверьте фотографии объявления.':privacy?(index===undefined?'В тексте обнаружены возможные персональные данные. Удалите или скройте их.':`На фотографии №${index+1} обнаружены возможные персональные данные. Удалите или закройте их.`):review.ru;
  const kk=code==='category_mismatch'?'Сипаттама таңдалған санатқа сәйкес келмейді. Санат пен мазмұнды тексеріңіз.':code==='image_mismatch'?'Фотосуреттер сипаттамаға сәйкес келмеуі мүмкін. Хабарландыру фотосуреттерін тексеріңіз.':privacy?(index===undefined?'Мәтінде дербес деректер болуы мүмкін. Оларды жойыңыз немесе жасырыңыз.':`№${index+1} фотосуретте дербес деректер болуы мүмкін. Оларды жойыңыз немесе жасырыңыз.`):review.kk;
  return {finding_code:code,source_type:source,...(index===undefined?{}:{image_index:index}),severity:action==='REJECTED'?'critical':action==='HUMAN_REVIEW'?'high':'medium',recommended_action:action,evidence_summary:code,user_reason_ru:ru,user_reason_kk:kk};
}
export function checkRules(text:string,rules:Rule[],source:Finding['source_type']='text',index?:number):Finding[]{
  const normalized=normalizeText(text).plain;
  const context=/(?:чехол|книг|игруш|макет|спорт|коллекци|без\s|не\s|ойыншық|кітап|қап\b|емес|жоқ|\btoy\b|\bcase\b|\bbook\b|\breplica\b)/iu.test(normalized);
  return rules.filter(r=>(!r.scope||r.scope.includes(source))&&r.config.terms.some(t=>containsCandidate(text,t))).map(r=>{
    // Only an explicit offer + unambiguous policy rule can deterministically hard-block.
    const explicit=!context&&r.config.explicit_offers.some(p=>containsCandidate(text,p));
    const action=explicit&&r.legal_status==='JEVU_POLICY'?r.action:'HUMAN_REVIEW';
    const f=finding(r.code,action,source,index);
    if(action==='REJECTED'){f.user_reason_ru='Размещение данного типа товара или услуги запрещено правилами JEVU.';f.user_reason_kk='JEVU ережелері бойынша тауардың немесе қызметтің осы түрін орналастыруға тыйым салынған.';}
    return {...f,rule_id:r.id,confidence:explicit?1:0.6};
  });
}
function semanticFindings(observations:Observation[],rules:Rule[],source:Finding['source_type'],index?:number):Finding[]{
  const conflict=observations.some(o=>o.code==='uncertain'||o.code==='safe_context');
  return observations.flatMap(o=>{
    if(o.code==='safe_context')return [];
    if(['document_visible','payment_card','personal_id'].includes(o.code))return [{...finding(o.code,o.confidence>=.85?'NEEDS_FIX':'HUMAN_REVIEW',source,index),confidence:o.confidence}];
    if(['category_mismatch','image_mismatch'].includes(o.code))return [{...finding(o.code,o.confidence>=.95?'NEEDS_FIX':'HUMAN_REVIEW',source,index),confidence:o.confidence}];
    const rule=rules.find(r=>(!r.scope||r.scope.includes(source))&&r.config.observation===o.code);
    if(rule){const confirmed=!conflict&&o.subject==='offered_item'&&o.confidence>=.98&&rule.legal_status==='JEVU_POLICY';const f=finding(rule.code,confirmed?rule.action:'HUMAN_REVIEW',source,index);if(f.recommended_action==='REJECTED'){f.user_reason_ru='Размещение данного типа товара или услуги запрещено правилами JEVU.';f.user_reason_kk='JEVU ережелері бойынша тауардың немесе қызметтің осы түрін орналастыруға тыйым салынған.';}return [{...f,rule_id:rule.id,confidence:o.confidence}]}
    return [{...finding(o.code,'HUMAN_REVIEW',source,index),confidence:o.confidence}];
  });
}
export function decide(stages:Stage[],findings:Finding[],risk:number,imageCount=0):ModerationResult['decision']{
  if(findings.some(f=>f.recommended_action==='REJECTED'))return 'REJECTED';
  const required=['rules','text','privacy','fraud','category','ai_text',...Array.from({length:imageCount},(_,i)=>[`image_technical_${i}`,`image_semantic_${i}`,`ocr_${i}`]).flat()];
  if(required.some(code=>!stages.some(s=>s.code===code&&s.status==='PASS'))||stages.some(s=>s.status!=='PASS')||findings.some(f=>f.recommended_action==='HUMAN_REVIEW'))return 'HUMAN_REVIEW';
  if(findings.some(f=>f.recommended_action==='NEEDS_FIX'))return 'NEEDS_FIX';
  if(risk>=40)return 'HUMAN_REVIEW';
  return 'APPROVED';
}
export async function moderate(input:{snapshot:Snapshot;rules:Rule[];fraud:FraudSignals;ai:ModerationAIProvider;ocr:ModerationOCRProvider;loadImage:(key:string)=>Promise<Uint8Array>;allowExternal:boolean;timeoutMs?:number;lexicalAIState?:LexicalAIState}):Promise<ModerationResult>{
  const {snapshot:s,ai,ocr}=input,stages:Stage[]=[],findings:Finding[]=[],images:ModerationResult['images']=[];
  const category=s.category_path.map(c=>`${c.slug} ${c.ru} ${c.kk}`).join(' / ');
  const rules=input.rules.filter(r=>r.enabled&&(r.applicable_categories.length===0||s.category_path.some(c=>r.applicable_categories.includes(c.slug))));
  const text=[s.title,s.description,...s.attributes.map(a=>JSON.stringify(a))].join('\n');
  const lexicalRules=rules.filter(r=>r.config.lexical&&(!r.scope||r.scope.includes('text')));
  const lexical=lexicalRules.length?await evaluateLexical(text,compileLexicalRules(lexicalRules),{aiState:input.lexicalAIState??'DISABLED'}):undefined;
  if(lexical)for(const code of lexical.finding_codes){const rule=lexicalRules.find(r=>r.code===code)!;const hard=lexical.confirmed_rule_codes.includes(code);const f=finding(code,hard?'REJECTED':'HUMAN_REVIEW','text');
    if(hard){f.user_reason_ru='Размещение данного типа товара или услуги запрещено правилами JEVU.';f.user_reason_kk='JEVU ережелері бойынша тауардың немесе қызметтің осы түрін орналастыруға тыйым салынған.';}
    findings.push({...f,rule_id:rule.id,confidence:hard?1:0.6});}
  findings.push(...checkRules(text,rules.filter(r=>!r.config.lexical)),...detectPersonalData(text).map(c=>finding(c,'NEEDS_FIX','text')));
  if(/(?:предоплат|аванс|алдын\s*ала|prepay).{0,70}(?:карт|сілтеме|ссылк|telegram|whatsapp)/iu.test(text))findings.push(finding('suspicious_payment','HUMAN_REVIEW','fraud'));
  const fraudRisk=Math.min(100,input.fraud.confirmed_reports*25+(input.fraud.recent_submissions>10?40:0)+(input.fraud.duplicate_content>0?40:0)+(input.fraud.reused_images>3?40:0)+(input.fraud.prior_rejections>=3?40:0));
  if(fraudRisk>=40)findings.push(finding('abuse_signals','HUMAN_REVIEW','fraud'));
  stages.push({code:'rules',status:'PASS'},{code:'text',status:'PASS'},{code:'privacy',status:'PASS'},{code:'fraud',status:'PASS'});
  if(lexical)recordLexicalExecution(lexical,stages,input.lexicalAIState??'DISABLED');
  if(!s.category_path.length){findings.push(finding('category_unavailable','HUMAN_REVIEW','category'));stages.push({code:'category',status:'ERROR'});}else stages.push({code:'category',status:'PASS'});
  // Coarse cross-category mismatch is a review signal, never a keyword rejection.
  if(/(?:phone|телефон)/iu.test(category)&&/(?:toyota\s*camry|тойота\s*камри|автомобил)/iu.test(s.title))findings.push(finding('category_mismatch','NEEDS_FIX','category'));
  const allowed=(p:typeof ai|typeof ocr,code:string)=>p.locality!=='unavailable'&&p.supportsRUandKK&&(p.locality==='KZ'||(input.allowExternal&&code==='ai_text'));
  async function analyze(code:string,p:typeof ai|typeof ocr,op:(signal:AbortSignal)=>Promise<void>){
    try{if(!allowed(p,code))throw new ProviderUnavailable();await bounded(op,input.timeoutMs);stages.push({code,status:'PASS',provider:p.name,version:p.version});}
    catch(error){stages.push({code,status:error instanceof ProviderUnavailable?'UNAVAILABLE':'ERROR',provider:p.name,version:p.version});findings.push(finding(error instanceof ProviderUnavailable?'provider_unavailable':'provider_error','HUMAN_REVIEW'));}
  }
  if(lexical&&['DETERMINISTIC_REJECT','HUMAN_REVIEW'].includes(lexical.lexical_routing_decision))stages.push({code:'ai_text',status:'UNAVAILABLE',provider:'local_route_gate',version:lexical.lexical_engine_version});
  else await analyze('ai_text',ai,async signal=>{const a=analysisSchema.parse(await ai.analyzeText({title:redactText(s.title),description:redactText(s.description),attributes:redactText(JSON.stringify(s.attributes)),category},signal));if(a.language==='other')throw new Error('unsupported_language');findings.push(...semanticFindings(a.observations,rules,'text'));});
  for(const [index,img] of s.images.entries()){
    let bytes:Uint8Array|undefined,mimeType='';
    try{
      bytes=await bounded(()=>input.loadImage(img.storage_key),input.timeoutMs);
      if(bytes.length>12*1024*1024)throw new Error('image_too_large');
      let width:number,height:number;
      if(bytes[0]===255&&bytes[1]===216){const valid=sanitizeProcessedJpeg(bytes);width=valid.width;height=valid.height;mimeType='image/jpeg';}
      else {const valid=await validateListingImage(new File([new Uint8Array(bytes)],'image',{type:'image/png'}));width=valid.width;height=valid.height;mimeType=valid.mimeType;}
      if((img.width&&width!==img.width)||(img.height&&height!==img.height)||(img.byte_size&&bytes.length!==img.byte_size)||(img.mime_type&&mimeType!==img.mime_type))throw new Error('image_metadata_mismatch');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('');
      images.push({image_index:index,sha256:hash,perceptual_hash:null,status:'PASS'});stages.push({code:`image_technical_${index}`,status:'PASS'});
    }catch{images.push({image_index:index,sha256:null,perceptual_hash:null,status:'ERROR'});stages.push({code:`image_technical_${index}`,status:'ERROR'});findings.push(finding('image_unavailable','HUMAN_REVIEW','image',index));}
    if(!bytes||images[index].status==='ERROR'){stages.push({code:`image_semantic_${index}`,status:'UNAVAILABLE'},{code:`ocr_${index}`,status:'UNAVAILABLE'});continue;}
    const imageBytes=bytes;
    await analyze(`image_semantic_${index}`,ai,async signal=>{const a=analysisSchema.parse(await ai.analyzeImage({bytes:imageBytes,mimeType,category,title:redactText(s.title)},signal));findings.push(...semanticFindings(a.observations,rules,'image',index));});
    await analyze(`ocr_${index}`,ocr,async signal=>{const result=ocrSchema.parse(await ocr.extractImageText({bytes:imageBytes,mimeType},signal));findings.push(...checkRules(result.text,rules,'ocr',index),...detectPersonalData(result.text).map(c=>finding(c,'NEEDS_FIX','ocr',index)));});
  }
  const risk=Math.min(100,Math.max(fraudRisk,...findings.map(f=>f.severity==='critical'?100:f.severity==='high'?60:30),0));
  return {...(lexical?{lexical}:{}),decision:decide(stages,findings,risk,s.images.length),risk_score:risk,findings:findings.slice(0,100),stages,images,provider:ai.name,provider_version:ai.version,ocr_provider:ocr.name,ocr_version:ocr.version,error_code:stages.some(s=>s.status!=='PASS')?'required_stage_unavailable':null};
}
