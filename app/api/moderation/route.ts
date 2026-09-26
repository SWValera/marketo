import {NextResponse} from 'next/server';import {z} from 'zod';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {moderationRuleConfigSchema} from '@/lib/moderation/contracts';
import {isSameOriginMutationRequest} from '@/lib/http/same-origin';
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('appeal'),run:z.string().uuid(),message:z.string().trim().min(10).max(2000)}).strict(),
 z.object({action:z.literal('resolve_appeal'),id:z.string().uuid(),resolution:z.enum(['upheld','overturned']),reason:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('resolve_report'),id:z.string().uuid(),resolution:z.enum(['resolved','dismissed']),reason:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('rules'),operation:z.enum(['clone','edit','review','activate','settings','rerun']),payload:z.record(z.string(),z.json())}).strict(),
]);
export async function POST(request:Request){
 if(!isSameOriginMutationRequest(request))return NextResponse.json({error:'forbidden'},{status:403});
 let raw:string;let bytes=0;
 try{
  if(!request.body)return NextResponse.json({error:'invalid_input'},{status:400});
  // Bound bytes while reading, including chunked requests without Content-Length.
  const bounded=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>30000)throw new Error('too_large');controller.enqueue(chunk)}}));
  raw=await new Response(bounded).text();
 }catch{return NextResponse.json({error:'invalid_input'},{status:bytes>30000?413:400})}
 let input;try{input=bodySchema.parse(JSON.parse(raw))}catch{return NextResponse.json({error:'invalid_input'},{status:400})}
 if(input.action==='rules'&&input.operation==='edit'&&input.payload.config!==undefined){const parsed=moderationRuleConfigSchema.safeParse(input.payload.config);if(!parsed.success||parsed.data.lexical&&(parsed.data.lexical.rule_code!==input.payload.code||parsed.data.lexical.ruleset_version!==input.payload.version))return NextResponse.json({error:'invalid_rule_config'},{status:400});}
 const client=await createSupabaseServerClient();const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return NextResponse.json({error:'authentication_required'},{status:401});
 const result=input.action==='appeal'?await client.rpc('appeal_listing_moderation',{target_run:input.run,message:input.message}):input.action==='resolve_appeal'?await client.rpc('resolve_moderation_appeal',{target_appeal:input.id,resolution:input.resolution,reason:input.reason}):input.action==='resolve_report'?await client.rpc('resolve_report',{target_report_id:input.id,resolution:input.resolution,note:input.reason}):await client.rpc('moderation_admin',{operation:input.operation,payload:input.payload});
 if(result.error)return NextResponse.json({error:result.error.code==='42501'?'forbidden':'moderation_action_failed'},{status:result.error.code==='42501'?403:409});
 return NextResponse.json({ok:true,id:result.data});
}
