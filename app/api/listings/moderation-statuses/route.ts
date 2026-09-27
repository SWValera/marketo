import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
export async function GET(request:Request){
 const ids=(new URL(request.url).searchParams.get('ids')??'').split(',');
 const headers={'cache-control':'private, no-store','vary':'Cookie'};
 if(ids.length>50||!ids.every(id=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))return NextResponse.json({error:'invalid_request'},{status:400,headers});
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc('my_moderation_statuses',{listing_ids:ids});
 // The RPC returns only rows owned by auth.uid(), never staff/provider metadata.
 return NextResponse.json(error?{error:'status_unavailable'}:data,{status:error?403:200,headers});
}
