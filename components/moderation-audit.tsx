import {createSupabaseServerClient} from '@/lib/supabase/server';
import type {Locale} from '@/lib/i18n/messages';
export async function ModerationAudit({listingId,locale}:{listingId:string;locale:Locale}){
 const {data,error}=await (await createSupabaseServerClient()).rpc('get_listing_moderation',{target_listing_id:listingId,staff_view:true});
 if(error)return <p>{locale==='kk'?'Тексеру тарихы қолжетімсіз.':'История автоматической проверки недоступна.'}</p>;
 return <section className="dashboard-card"><h2>{locale==='kk'?'Автоматты тексеру және тарих':'Автоматическая проверка и история'}</h2><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(data,null,2)}</pre></section>;
}
