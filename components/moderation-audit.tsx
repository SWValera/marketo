'use client';
import {useRef,useState} from 'react';
import type {Locale} from '@/lib/i18n/messages';
import type {AutomaticTrace} from '@/lib/moderation/automatic';
import {moderationText} from '@/lib/moderation/labels';
type Run={id:string;decision?:string;decision_basis?:string;created_at:string;automatic_trace?:AutomaticTrace};
type Audit={run?:Run;history?:Run[];overrides?:{new_decision:string;reason:string;created_at:string;automatic_decision:string}[];findings?:{user_reason_ru:string;user_reason_kk:string;image_index:number|null}[]};
export function ModerationAudit({listingId,locale}:{listingId:string;locale:Locale}){
 const kk=locale==='kk',[audit,setAudit]=useState<Audit|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),lock=useRef(false);
 async function load(){if(lock.current||audit)return;lock.current=true;setBusy(true);setError(false);try{const r=await fetch(`/api/admin/moderation?view=audit&id=${listingId}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();setAudit(await r.json());}catch{setError(true);}finally{lock.current=false;setBusy(false);}}
 const trace=audit?.run?.automatic_trace,txt=(code:string|null|undefined)=>moderationText(code,locale);
 return <details className="dashboard-card moderation-audit" onToggle={e=>{if(e.currentTarget.open)void load();}}><summary>{kk?'Автоматты тексеру және шешімдер тарихы':'Автоматическая проверка и история решений'}</summary>
 {busy?<p role="status">{kk?'Тарих жүктелуде…':'Загружаем историю…'}</p>:null}{error?<p role="alert">{kk?'Тарих қолжетімсіз.':'История недоступна.'} <button type="button" onClick={()=>void load()}>{kk?'Қайталау':'Повторить'}</button></p>:null}
 {audit?<><h3>{kk?'Автоматты тексеру':'Автоматическая проверка'}</h3><p>{txt(audit.run?.decision)}</p><p>{txt(trace?.provider_status??audit.run?.decision_basis)}</p>
 {trace?<><h3>{kk?'Тексеру кезеңдері':'Этапы проверки'}</h3><ol>{trace.timeline.map(s=><li key={s.code}>{txt(s.code)} — {txt(s.status)}{s.duration_ms===null?'':` · ${(s.duration_ms/1000).toLocaleString(kk?'kk-KZ':'ru-RU')} с`}</li>)}</ol>{trace.category?<p>{txt(trace.category.status)}</p>:null}<p>{kk?'Талданған суреттер':'Проанализировано фотографий'}: {trace.vision_images}. {kk?'Мәтіні тексерілген суреттер':'Проверен текст на фотографиях'}: {trace.ocr_images}.</p>
 <ul>{trace.observations.filter(o=>o.present).map((o,i)=><li key={i}>{txt(o.code)} — {txt(o.source)}{o.image_index===null?'':` №${o.image_index+1}`} · {kk?'Сенімділік':'Уверенность'}: {Math.round(o.confidence*100)}% · {txt(o.subject)}</li>)}</ul></>:null}
 <h3>{kk?'Анықталған ескертулер':'Выявленные замечания'}</h3>{audit.findings?.length?<ul>{audit.findings.map((f,i)=><li key={i}>{f.image_index===null?'':`${kk?'Фото':'Фотография'} №${f.image_index+1}: `}{kk?f.user_reason_kk:f.user_reason_ru}</li>)}</ul>:<p>{kk?'Ескертулер сақталмаған.':'Замечаний не сохранено.'}</p>}
 <h3>{kk?'Шешімдер тарихы':'История решений'}</h3>{audit.overrides?.map((o,i)=><p key={i}>{new Date(o.created_at).toLocaleString(kk?'kk-KZ':'ru-RU')} · {txt(o.automatic_decision)} → {txt(o.new_decision)} · {o.reason==='manual review before automated decision'?(kk?'Қолмен тексерілді':'Проверено модератором'):o.reason}</p>)}
 {audit.history?.map(r=><p key={r.id}>{new Date(r.created_at).toLocaleString(kk?'kk-KZ':'ru-RU')} · {txt(r.decision)} · {txt(r.decision_basis)}</p>)}
 <details className="moderation-technical"><summary>{kk?'Техникалық мәліметтер':'Технические сведения'}</summary><pre>{JSON.stringify(audit,null,2)}</pre></details></>:null}</details>;
}
