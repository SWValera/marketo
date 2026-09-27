'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Locale} from '@/lib/i18n/messages';
export function ModerationOwnerControls({listingId,revision,title,description,price,locale,onChanged}:{listingId:string;revision:string;title:string;description:string;price:number|null;locale:Locale;onChanged:()=>void}){
 const router=useRouter(),kk=locale==='kk';const [name,setName]=useState(title),[text,setText]=useState(description),[amount,setAmount]=useState(price===null?'':String(price)),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
 async function act(operation:'edit'|'archive'|'delete'){
  if(busy||reason.trim().length<3)return;setBusy(true);setFeedback('');
  try{const response=await fetch(`/api/admin/listings/${listingId}/owner`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,expected_revision:revision,reason,...(operation==='edit'?{title:name,description:text,price_minor:amount===''?null:Number(amount)}:{})})});
   if(response.status===409){setFeedback(kk?'Мазмұн өзгерді. Бетті жаңартыңыз.':'Содержимое изменилось. Обновите страницу.');return;}
   if(!response.ok)throw Error();if(operation==='delete')router.replace('/admin');else onChanged();setFeedback(kk?'Өзгеріс сақталды.':'Изменение сохранено.');
  }catch{setFeedback(kk?'Әрекет орындалмады.':'Не удалось выполнить действие.');}finally{setBusy(false)}
 }
 return <details className="dashboard-card"><summary>{kk?'Иесінің басқаруы':'Управление владельца проекта'}</summary><p>{kk?'Мазмұн өзгерісі қайта тексеріледі. Жариялау мерзімі сақталады.':'Изменение содержимого отправит объявление на повторную проверку. Срок публикации сохранится.'}</p><label className="form-field">{kk?'Атауы':'Название'}<input value={name} maxLength={70} onChange={e=>setName(e.target.value)}/></label><label className="form-field">{kk?'Сипаттама':'Описание'}<textarea rows={5} value={text} maxLength={20000} onChange={e=>setText(e.target.value)}/></label><label className="form-field">{kk?'Бағасы, ₸':'Цена, ₸'}<input type="number" min="0" max="90000000000" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="form-field">{kk?'Міндетті себеп':'Обязательная причина'}<textarea value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label><div><button type="button" className="approve-action" disabled={busy||reason.trim().length<3} onClick={()=>void act('edit')}>{kk?'Сақтап, қайта тексеру':'Сохранить и перепроверить'}</button><button type="button" className="reject-action" disabled={busy||reason.trim().length<3} onClick={()=>void act('archive')}>{kk?'Мұрағаттау':'Архивировать'}</button><button type="button" className="reject-action" disabled={busy||reason.trim().length<3} onClick={()=>void act('delete')}>{kk?'Жою (тарих сақталады)':'Удалить (история сохраняется)'}</button></div><p role="status">{feedback}</p></details>;
}
