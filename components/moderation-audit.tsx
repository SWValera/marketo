import {createSupabaseServerClient} from '@/lib/supabase/server';
import type {Locale} from '@/lib/i18n/messages';
import type {ShadowResult} from '@/lib/moderation/shadow';
import type {AICallMetadata} from '@/lib/moderation/ai-contract';
import type {AutomaticTrace} from '@/lib/moderation/automatic';
import type {ModerationListingDetail} from '@/lib/data/types';
import {automaticLabel} from '@/lib/moderation/dashboard';
import {ModerationOwnerControls} from './moderation-owner-controls';
type Run={id:string;decision?:string;decision_basis?:string;engine_version:string;content_revision_hash:string;ruleset_version:string;created_at:string;completed_at:string|null;automatic_trace?:AutomaticTrace;shadow_result?:ShadowResult;ai_calls?:AICallMetadata[]};
export async function ModerationAudit({listingId,locale,item}:{listingId:string;locale:Locale;item?:ModerationListingDetail}){
 const {data,error}=await(await createSupabaseServerClient()).rpc('get_listing_moderation',{target_listing_id:listingId,staff_view:true});const kk=locale==='kk';
 if(error)return <p>{kk?'Тексеру тарихы қолжетімсіз.':'История автоматической проверки недоступна.'}</p>;
 const audit=data as unknown as {run?:Run;current_revision:string;owner_controls:boolean;history?:Run[];overrides?:{new_decision:string;reason:string;created_at:string;moderator_id:string;automatic_decision:string}[];findings?:{finding_code:string;rule_id:string|null;source_type:string;image_index:number|null;confidence:number|null;user_reason_ru:string;user_reason_kk:string}[];image_hashes?:{image_index:number;sha256:string;perceptual_hash:string|null;algorithm:string|null}[]}|null;
 const run=audit?.run,trace=run?.automatic_trace,shadow=run?.shadow_result,calls=run?.ai_calls??[],human=audit?.overrides?.[0];
 return <><section className="dashboard-card"><h2>{kk?'Автоматты тексеру және тарих':'Автоматическая проверка и история'}</h2>
 <h3>FINAL DECISION</h3><p><strong>{human?.new_decision??automaticLabel(run?.decision)}</strong> · {human?'MANUAL':'AUTOMATIC'}</p>
 <p>{kk?'Бастапқы автоматты шешім':'Исходное автоматическое решение'}: {automaticLabel(run?.decision)} · {run?.decision_basis??'—'}</p>
 <dl><div><dt>Content revision</dt><dd style={{overflowWrap:'anywhere'}}>{run?.content_revision_hash??audit?.current_revision}</dd></div><div><dt>Ruleset / Engine</dt><dd>{run?.ruleset_version} / {run?.engine_version}</dd></div><div><dt>Lexical</dt><dd>{trace?.lexical?.lexical_engine_version} · {trace?.lexical?.lexical_routing_decision}</dd></div></dl>
 {trace?<><h3>{kk?'Тексеру кезеңдері':'Этапы проверки'}</h3><ol>{trace.timeline.map(s=><li key={s.code}>{s.code} — {s.status}{s.duration_ms===null?'':` · ${s.duration_ms} ms`}</li>)}<li>{run?.decision==='APPROVED'?'PUBLISHED':automaticLabel(run?.decision)}</li></ol><p>CATEGORY: {trace.category?.status??'UNCERTAIN'} · {trace.category?.confidence??'—'} · OCR: {trace.ocr_images} · VISION: {trace.vision_images}</p><details><summary>LOCAL TEXT</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(trace.lexical,null,2)}</pre></details><h3>AI / VISION / OCR</h3><p>{trace.provider_status} · schema={String(trace.schema_validated)} · uncertainty={trace.uncertainty??'—'}</p><ul>{trace.observations.filter(o=>o.present).map((o,i)=><li key={i}>{o.code} · {o.source}{o.image_index===null?'':` #${o.image_index+1}`} · {Math.round(o.confidence*100)}% · {o.subject}</li>)}</ul></>:null}
 {calls.map((call,i)=><p key={i}>{call.provider} · {call.model} · {call.status} · {call.latency_ms??'—'} ms · {call.input_tokens??'—'}/{call.output_tokens??'—'} tokens · retry={call.retry_count}</p>)}
 <h3>{kk?'Анықталған белгілер':'Выявленные признаки'}</h3><ul>{audit?.findings?.map((f,i)=><li key={i}>{f.finding_code} · {f.source_type}{f.image_index===null?'':` #${f.image_index+1}`} · {f.confidence??'—'} · {kk?f.user_reason_kk:f.user_reason_ru}</li>)}</ul>
 <details><summary>IMAGE SHA / dHash</summary><ul>{audit?.image_hashes?.map((image,i)=><li key={i} style={{overflowWrap:'anywhere'}}>#{image.image_index+1} · SHA-256: {image.sha256} · {image.algorithm??'unavailable'}: {image.perceptual_hash??'—'}</li>)}</ul></details>
 {shadow?<details><summary>AI SHADOW RESULT · {shadow.recommendation}</summary><p>{kk?'Салыстыруға арналған ұсыным. Соңғы шешімді жергілікті ережелер қабылдайды.':'Рекомендация для сравнения. Итог выбирают локальные правила.'}</p><p>{shadow.status}</p><ul>{shadow.findings.map((f,i)=><li key={i}>{f.code} · {f.source} · {f.action} · {f.rule_code}</li>)}</ul></details>:null}
 <h3>{kk?'Қолмен өзгерту тарихы':'История ручных решений'}</h3>{audit?.overrides?.map((o,i)=><p key={i}>{o.created_at} · {o.automatic_decision} → {o.new_decision} · {o.reason} · {o.moderator_id}</p>)}
 <details><summary>{kk?'Толық тексеру тарихы':'Полная история проверки'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(data,null,2)}</pre></details></section>
 {audit?.owner_controls&&item?<ModerationOwnerControls listingId={listingId} revision={audit.current_revision} title={item.title} description={item.description} price={item.priceMinor} locale={locale}/>:null}</>;
}
