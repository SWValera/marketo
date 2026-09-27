'use client';
import {useRef,useState} from 'react';
import {useI18n} from './i18n-provider';
import {MODERATION_NOTE_MAX_LENGTH,MODERATION_REJECTION_REASONS,type ModerationRejectionReason} from '@/lib/moderation/policy';
export type ModeratorOutcome={id:string;status:'active'|'rejected';decision:string;revision:string;override_id:string|null};
type Action='approve'|'reject'|'needs_fix';
export function ModerationDecision({listingId,revision,onSaved}:{listingId:string;revision:string;onSaved:(value:ModeratorOutcome)=>void}){
 const {locale,t}=useI18n(),kk=locale==='kk';const [action,setAction]=useState<Action|null>(null),[reason,setReason]=useState<ModerationRejectionReason|''>(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
 const lock=useRef(false),receipt=useRef<string|null>(null);
 const labels={approve:t('admin.approve'),reject:t('admin.reject'),needs_fix:kk?'Түзетуге қайтару':'Вернуть на исправление'};
 function choose(value:Action){if(lock.current)return;setAction(value);setReason('');setNote('');setFeedback('');receipt.current=crypto.randomUUID();}
 async function save(){
  if(!action||lock.current)return;if(action!=='approve'&&(!reason||!note.trim())){setFeedback(kk?'Себепті таңдап, түсіндірме жазыңыз.':'Выберите причину и укажите, что необходимо исправить.');return;}
  lock.current=true;setBusy(true);setFeedback(t('admin.submitting'));
  try{const response=await fetch(`/api/admin/listings/${listingId}/moderate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:action,reasonCode:action==='approve'?null:reason,note:note.trim()||null,revision,requestId:receipt.current}),signal:AbortSignal.timeout(15000)});
   const body=await response.json() as {listing?:ModeratorOutcome};if(!response.ok){setFeedback(t(response.status===409?'admin.stale':response.status===401||response.status===403?'admin.forbidden':'admin.failed'));return;}
   const value=body.listing as ModeratorOutcome;if(value?.id!==listingId||!['active','rejected'].includes(value.status)||value.revision!==revision)throw Error('invalid_receipt');
   onSaved(value);setAction(null);setFeedback(t('admin.success'));
  }catch{setFeedback(t('admin.failed'));}finally{lock.current=false;setBusy(false);}
 }
 return <aside className="dashboard-card moderation-decision"><h2>{kk?'Модератор әрекеттері':'Действия модератора'}</h2>
 <div className="moderation-decision-actions">{(['approve','reject','needs_fix'] as const).map(a=><button type="button" key={a} className={`moderator-action moderator-action-${a}`} disabled={busy} aria-pressed={action===a} onClick={()=>choose(a)}>{labels[a]}</button>)}</div>
 {action?<form className="moderation-action-form" onSubmit={e=>{e.preventDefault();void save();}}><h3>{labels[action]}</h3>{action==='approve'?<p>{kk?'Осы нұсқаны жариялауды растаңыз. Түсініктеме міндетті емес.':'Подтвердите публикацию этой версии. Комментарий необязателен.'}</p>:<label className="form-field"><span>{kk?'Шешім себебі':'Причина решения'}</span><select required value={reason} disabled={busy} onChange={e=>{setReason(e.target.value as ModerationRejectionReason);receipt.current=crypto.randomUUID();}}><option value="">{t('admin.reasonPlaceholder')}</option>{MODERATION_REJECTION_REASONS.map(r=><option key={r.code} value={r.code}>{r[locale]}</option>)}</select></label>}
 <label className="form-field"><span>{action==='approve'?(kk?'Түсініктеме (міндетті емес)':'Комментарий (необязательно)'):(kk?'Сатушыға түсіндірме':'Пояснение для продавца')}</span><textarea rows={3} maxLength={MODERATION_NOTE_MAX_LENGTH} required={action!=='approve'} value={note} disabled={busy} onChange={e=>{setNote(e.target.value);receipt.current=crypto.randomUUID();}}/></label><button type="submit" className={`moderator-action moderator-action-${action}`} disabled={busy}>{busy?t('admin.submitting'):(kk?'Шешімді растау':'Подтвердить решение')}</button><button type="button" className="text-button" disabled={busy} onClick={()=>setAction(null)}>{kk?'Бас тарту':'Отмена'}</button></form>:null}
 {feedback?<p role="status" aria-live="polite">{feedback}</p>:null}</aside>;
}
