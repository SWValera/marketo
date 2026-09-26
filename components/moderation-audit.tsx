import {createSupabaseServerClient} from '@/lib/supabase/server';
import type {Locale} from '@/lib/i18n/messages';
import type {ShadowResult} from '@/lib/moderation/shadow';
import type {AICallMetadata} from '@/lib/moderation/ai-contract';
export async function ModerationAudit({listingId,locale}:{listingId:string;locale:Locale}){
 const {data,error}=await (await createSupabaseServerClient()).rpc('get_listing_moderation',{target_listing_id:listingId,staff_view:true});
 if(error)return <p>{locale==='kk'?'Тексеру тарихы қолжетімсіз.':'История автоматической проверки недоступна.'}</p>;
 const audit=data as unknown as {run?:{decision?:string;shadow_result?:ShadowResult;ai_calls?:AICallMetadata[]};overrides?:{new_decision:string}[]}|null;
 const shadow=audit?.run?.shadow_result,calls=audit?.run?.ai_calls??[],human=audit?.overrides?.[0]?.new_decision;
 return <section className="dashboard-card"><h2>{locale==='kk'?'Автоматты тексеру және тарих':'Автоматическая проверка и история'}</h2>
 <h3>FINAL DECISION</h3><p>{human??audit?.run?.decision??'HUMAN_REVIEW'} · {human?(locale==='kk'?'Модератор шешімі':'Решение модератора'):(locale==='kk'?'Қолданыстағы модерация нәтижесі':'Действующий результат модерации')}</p>
 {shadow?<><h3>AI SHADOW RESULT</h3><p>{locale==='kk'?'Тек бағалау үшін. Жарияламайды және қабылдамайды.':'Только для оценки качества. Не публикует и не отклоняет.'}</p><p><strong>{shadow.recommendation}</strong> · {shadow.status}</p>
 {calls.map((call,i)=><p key={i}>{call.provider} · {call.model} · {call.status} · {call.latency_ms??'—'} ms · {call.input_tokens??'—'}/{call.output_tokens??'—'} tokens</p>)}
 <ul>{shadow.subjects.map(s=><li key={s.image_index}>#{s.image_index+1} · {s.object_type} · {Math.round(s.confidence*100)}%</li>)}</ul>
 <ul>{shadow.findings.map((f,i)=><li key={i}>{f.code} · {f.source}{f.image_index===null?'':` · #${f.image_index+1}`}{f.confidence===null?'':` · ${Math.round(f.confidence*100)}%`} · {f.action}{f.rule_code?` · ${f.rule_code}`:''}</li>)}</ul></>:null}
 <details><summary>{locale==='kk'?'Толық тексеру тарихы':'Полная история проверки'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(data,null,2)}</pre></details></section>;
}
