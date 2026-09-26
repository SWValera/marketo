import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'invalid_id'},{status:400});
  const client=await createSupabaseServerClient();const {data,error}=await client.rpc('get_listing_moderation',{target_listing_id:id});
  return NextResponse.json(error?{error:'moderation_unavailable'}:data,{status:error?403:200,headers:{'cache-control':'private, no-store'}});
}
