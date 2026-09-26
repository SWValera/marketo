import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {isSameOriginMutationRequest} from '@/lib/http/same-origin';
export async function GET(){
 const client=await createSupabaseServerClient();const {data,error}=await client.rpc('get_seller_verification');
 return NextResponse.json(error?{error:'verification_unavailable'}:{state:data,providerAvailable:false},{status:error?401:200,headers:{'cache-control':'private, no-store'}});
}
export async function POST(request:Request){
 if(!isSameOriginMutationRequest(request))return NextResponse.json({error:'forbidden'},{status:403});
 const client=await createSupabaseServerClient();const auth=await client.auth.getUser();
 if(auth.error||!auth.data.user)return NextResponse.json({error:'authentication_required'},{status:401});
 // No reviewed SMS adapter exists. Never create a challenge or verified state.
 return NextResponse.json({error:'sms_provider_unavailable'},{status:503});
}
