import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {getRequestUser} from '@/lib/auth/request-user';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {moderationRepository} from '@/lib/data/repositories';
import {moderationFilter} from '@/lib/moderation/dashboard';
const headers={'cache-control':'private, no-store','vary':'Cookie'};
export async function GET(request:Request){
 const url=new URL(request.url),view=url.searchParams.get('view')??'queue',id=url.searchParams.get('id'),locale=url.searchParams.get('locale')==='kk'?'kk':'ru';
 if(!['queue','case','audit','metrics'].includes(view)||(['case','audit'].includes(view)&&!id?.match(/^[a-f0-9-]{36}$/i)))return NextResponse.json({error:'invalid_request'},{status:400,headers});
 try{
  const client=await createSupabaseServerClient();let data;
  if(view==='queue')data=await moderationRepository.list(client,{filter:moderationFilter(url.searchParams.get('filter')),page:Number(url.searchParams.get('page')??1),locale});
  else if(view==='case'){data=await moderationRepository.findById(client,id!,locale);if(!data)return NextResponse.json({error:'unavailable'},{status:404,headers});}
  else{const result=view==='audit'?await client.rpc('moderation_staff_audit',{target_listing_id:id!}):await client.rpc('moderation_admin',{operation:'queue'});if(result.error)throw result.error;data=result.data;
   if(view==='metrics')data={...(data as object),worker:{automatic:env.MODERATION_AUTOMATIC_ENABLED==='true',approval:env.MODERATION_AUTOMATIC_APPROVAL_ENABLED==='true',rejection:env.MODERATION_AUTOMATIC_REJECTION_ENABLED==='true',external:env.MODERATION_EXTERNAL_AI_ENABLED==='true',shadow:env.MODERATION_AI_SHADOW_MODE!=='false'}};
  }
  return NextResponse.json(data,{headers});
 }catch(error){
  // Each RPC checks the authenticated DB role AND active staff profile. Repeating
  // auth + profile + role reads here added two serial network round trips.
  const cause=error instanceof Error&&error.cause?error.cause:error;
  if(cause&&typeof cause==='object'&&'code' in cause&&cause.code==='42501'){
   const {data}=await getRequestUser(await createSupabaseServerClient());
   return NextResponse.json({error:'access_unavailable'},{status:data.user?403:401,headers});
  }
  return NextResponse.json({error:'moderation_read_failed'},{status:503,headers});
 }
}
