"use client";
import {useEffect,useState,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useI18n} from './i18n-provider';
import type {OwnerModerationStatus as State} from '@/lib/data/types';
import {moderationText} from '@/lib/moderation/labels';
const labels:Record<string,{ru:string;kk:string}>={AUTOMATIC_MODERATION:{ru:'Проверяем объявление',kk:'Хабарландыру тексеріліп жатыр'},APPROVED:{ru:'Объявление опубликовано',kk:'Хабарландыру жарияланды'},NEEDS_FIX:{ru:'Нужно исправить объявление',kk:'Хабарландыруды түзетіңіз'},REJECTED:{ru:'Объявление не опубликовано',kk:'Хабарландыру қабылданбады'},HUMAN_REVIEW:{ru:'Объявление требует дополнительной проверки.',kk:'Хабарландыру қосымша тексеруді қажет етеді.'},DRAFT:{ru:'Черновик',kk:'Жоба'}};
export function ModerationStatus({listingId,initial}:{listingId:string;initial?:State}){
 const {locale}=useI18n(),router=useRouter();const [state,setState]=useState<State|null>(initial??null),[message,setMessage]=useState(''),[feedback,setFeedback]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const previous=useRef(initial?.status??null);
 useEffect(()=>{if(initial)return;let live=true,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();const started=Date.now();
  async function read(){try{const r=await fetch(`/api/listings/${listingId}/moderation`,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const data=await r.json() as State;if(!live)return;setState(data);if(previous.current&&previous.current!==data.status){previous.current=data.status;router.refresh();}else previous.current=data.status;if(data.status==='AUTOMATIC_MODERATION'&&Date.now()-started<15*60*1000)timer=setTimeout(()=>void read(),8000);}catch{if(live)setFeedback(locale==='kk'?'Тексеру күйін жүктеу мүмкін болмады. Бетті жаңартыңыз.':'Не удалось загрузить статус проверки. Обновите страницу.');}}const refresh=()=>void read();window.addEventListener('focus',refresh);const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('jevu-moderation');if(channel)channel.onmessage=refresh;void read();return()=>{live=false;clearTimeout(timer);controller.abort();window.removeEventListener('focus',refresh);channel?.close()};
 // The server snapshot seeds this mount; polling owns subsequent updates.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[listingId,locale,router]);
 async function appeal(){if(busy||!state?.run_id)return;setBusy(true);try{const r=await fetch('/api/moderation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'appeal',run:state.run_id,message})});if(!r.ok)throw Error();setFeedback(locale==='kk'?'Өтініш модераторға жіберілді.':'Обращение отправлено модератору.');setOpen(false);setState({...state,can_appeal:false});}catch{setFeedback(locale==='kk'?'Жіберу мүмкін болмады.':'Не удалось отправить обращение.');}finally{setBusy(false)}}
 return <div className="inline-feedback" role="status"><strong>{state?.label_code?moderationText(state.label_code,locale):state?(labels[state.status]??labels.HUMAN_REVIEW)[locale]:labels.AUTOMATIC_MODERATION[locale]}</strong>
 {state?.reasons?.map((r,i)=><p key={i}>{r[locale]}</p>)}
 {state?.status==='NEEDS_FIX'?<a href={`/publish?listing=${listingId}`}>{locale==='kk'?'Хабарландыруды түзету':'Исправить объявление'}</a>:null}
 {state?.can_appeal?<button type="button" className="report-link" onClick={()=>setOpen(!open)}>{locale==='kk'?'Шешіммен келіспеймін':'Не согласен с решением'}</button>:null}
 {open?<div className="form-field"><textarea aria-label={locale==='kk'?'Өтініш себебі':'Причина обращения'} minLength={10} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/><button type="button" disabled={busy||message.trim().length<10} onClick={()=>void appeal()}>{locale==='kk'?'Жіберу':'Отправить'}</button></div>:null}{feedback?<p>{feedback}</p>:null}</div>;
}
export function SellerVerificationStatus(){const {locale}=useI18n();const [verified,setVerified]=useState<boolean|null>(null);useEffect(()=>{const c=new AbortController();void fetch('/api/account/phone',{signal:c.signal}).then(r=>r.ok?r.json() as Promise<{state?:{verified?:boolean}}>:null).then(d=>{if(d)setVerified(Boolean(d.state?.verified))}).catch(()=>{});return()=>c.abort()},[]);return <p className="inline-feedback">{verified?locale==='kk'?'Қазақстан нөмірі SMS арқылы расталған.':'Казахстанский номер подтверждён по SMS.':locale==='kk'?'SMS арқылы нөмірді растау әзірге қолжетімсіз.':'Подтверждение номера по SMS пока недоступно.'}</p>}
