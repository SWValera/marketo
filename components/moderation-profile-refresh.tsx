'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import type {OwnerModerationStatus} from '@/lib/data/types';

/** One bounded status read per visible page, never one request per listing. */
export function ModerationProfileRefresh({states}:{states:Record<string,OwnerModerationStatus>}){
 const router=useRouter();
 const fingerprint=JSON.stringify(Object.entries(states).map(([id,s])=>[id,s.effective_state,s.run_id]));
 useEffect(()=>{
  const entries=JSON.parse(fingerprint) as [string,string,string|null][];
  if(!entries.length)return;
  const controller=new AbortController();let busy=false,changed=false;
  async function refresh(){
   if(busy||changed||document.visibilityState!=='visible')return;busy=true;
   try{const response=await fetch('/api/listings/moderation-statuses?ids='+entries.map(e=>e[0]).join(','),{cache:'no-store',signal:controller.signal});if(!response.ok)return;
    const data=await response.json() as Record<string,OwnerModerationStatus>;
    if(entries.some(([id,state,run])=>!data[id]||data[id].effective_state!==state||data[id].run_id!==run)){changed=true;router.refresh();}
   }catch{/* Keep the last server snapshot; a later focus/poll can retry. */}finally{busy=false;}
  }
  const timer=setInterval(()=>void refresh(),15000),focus=()=>void refresh();
  window.addEventListener('focus',focus);const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('jevu-moderation');if(channel)channel.onmessage=focus;
  return()=>{controller.abort();clearInterval(timer);channel?.close();window.removeEventListener('focus',focus);};
 },[fingerprint,router]);
 return null;
}
