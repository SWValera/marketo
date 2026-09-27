import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireModerationAccess,ModerationAccessError} from '@/lib/auth/moderation-access';
import {hasRole} from '@/lib/auth/context';
import {isSameOriginMutationRequest} from '@/lib/http/same-origin';
import {createSupabaseServerClient} from '@/lib/supabase/server';
const bodySchema=z.object({operation:z.enum(['edit','archive','delete']),reason:z.string().trim().min(3).max(1000),expected_revision:z.string().regex(/^[a-f0-9]{64}$/),title:z.string().trim().min(3).max(70).optional(),description:z.string().trim().min(10).max(20000).optional(),price_minor:z.number().int().min(0).max(90000000000).nullable().optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!isSameOriginMutationRequest(request))return NextResponse.json({error:'cross_origin_request_denied'},{status:403});
 try{const context=await requireModerationAccess();if(!hasRole(context,'admin'))return NextResponse.json({error:'owner_permission_required'},{status:403});}
 catch(error){return NextResponse.json({error:'authorization_required'},{status:error instanceof ModerationAccessError&&error.reason==='anonymous'?401:403});}
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'invalid_listing_id'},{status:400});
 let raw;try{raw=await request.json();}catch{return NextResponse.json({error:'invalid_request'},{status:400});}
 const parsed=bodySchema.safeParse(raw);if(!parsed.success)return NextResponse.json({error:'invalid_request'},{status:422});
 const {operation,...payload}=parsed.data;
 if(operation==='edit'&&(payload.title===undefined||payload.description===undefined||payload.price_minor===undefined))return NextResponse.json({error:'invalid_content'},{status:422});
 const {error}=await(await createSupabaseServerClient()).rpc('moderation_owner_listing',{target_listing_id:id,operation,payload});
 if(error)return NextResponse.json({error:error.code==='40001'?'content_changed':'action_failed'},{status:error.code==='42501'?403:error.code==='40001'?409:422});
 return NextResponse.json({ok:true});
}
