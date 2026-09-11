import {getCurrentAuthContext} from '@/lib/auth/context';
import {isSameOriginMutationRequest} from '@/lib/http/same-origin';
import {photoPipeline, readPhotoBytes} from '@/lib/media/photo-contract';
import {normalizeListingImage, withPhotoProcessing} from '@/lib/media/server-image-normalization';
import {getListingImageProcessor, photoFailure} from '@/lib/media/photo-service';

export async function POST(request:Request) {
  const headers={'cache-control':'private, no-store', 'x-content-type-options':'nosniff',vary:'Cookie, Authorization'};
  if(!isSameOriginMutationRequest(request)) return Response.json({error:'cross_origin_request_denied'},{status:403,headers});
  const context=await getCurrentAuthContext();
  if(context.status==='error') return Response.json({error:'photo_processing_unavailable'},{status:503,headers});
  if(context.status!=='authenticated') return Response.json({error:'authentication_required'},{status:401,headers});
  if(context.accountStatus!=='active') return Response.json({error:'account_not_active'},{status:403,headers});
  try {
    const processor=getListingImageProcessor(); // fail before reading an original if unconfigured
    const image=await withPhotoProcessing(async signal=>{
      const declared=request.headers.get('content-length');
      if(declared!==null && (!/^\d+$/.test(declared) || Number(declared)>photoPipeline.maxSourceBytes)) throw new Error('photo_processor_limit');
      if(!request.body) throw new Error('invalid_image_size');
      let bytes:Uint8Array;
      try {bytes=await readPhotoBytes(request.body,photoPipeline.maxSourceBytes,signal);}
      catch(error){if(error instanceof Error && error.message==='photo_output_too_large') throw new Error('photo_processor_limit');throw error;}
      if(declared!==null && Number(declared)!==bytes.length) throw new Error('invalid_image_size');
      const file=new File([bytes as Uint8Array<ArrayBuffer>],'photo',{type:request.headers.get('content-type')??''});
      return normalizeListingImage(file,processor,signal);
    },request.signal);
    // Originals and preview responses are never persisted to R2, DB or caches.
    return new Response(image.bytes as Uint8Array<ArrayBuffer>,{headers:{...headers,'content-type':'image/jpeg'}});
  }catch(error){const failure=photoFailure(error);return Response.json({error:failure.error},{status:failure.status,headers});}
}
