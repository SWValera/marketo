import {photoOutputSize, photoPipeline, readPhotoBytes} from './photo-contract.ts';
import {sanitizeProcessedJpeg} from './processed-jpeg.ts';
import type {ValidatedImage} from './image-validation.ts';

export type PhotoProcessor = Pick<ImagesBinding, 'input' | 'info'>;

export async function assertPhotoSource(file: File) {
  if(file.size<32) throw new Error('invalid_image_size');
  if(file.size>photoPipeline.maxSourceBytes) throw new Error('photo_processor_limit');
  const b=new Uint8Array(await file.slice(0,512).arrayBuffer());
  const ascii=(at:number,n:number)=>String.fromCharCode(...b.subarray(at,at+n));
  let type='';
  if(b[0]===255 && b[1]===216 && b[2]===255) type='image/jpeg';
  else if(b.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])) type='image/png';
  else if(ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP') type='image/webp';
  else if(ascii(4,4)==='ftyp') {
    const brands=[]; for(let at=8; at+4<=b.length && at<Math.min(new DataView(b.buffer).getUint32(0),512);at+=4){if(at!==12) brands.push(ascii(at,4));}
    if(brands.some(x=>['heic','heix','hevc','hevx','mif1'].includes(x)) && !brands.some(x=>['avif','avis'].includes(x))) type='image/heic';
  }
  if(!type) throw new Error('unsupported_image_content');
  const declared=file.type.toLowerCase();
  if(declared && declared!=='application/octet-stream' && declared!==type
    && !(type==='image/heic' && declared==='image/heif')) throw new Error('image_mime_mismatch');
  return type;
}

export async function normalizeListingImage(file: File, processor: PhotoProcessor, signal: AbortSignal): Promise<ValidatedImage> {
  await assertPhotoSource(file);
  const info=await processor.info(file.stream());
  if(!('width' in info) || !('height' in info)) throw new Error('unsupported_image_content');
  photoOutputSize(info.width,info.height); // reject bombs before full decode
  signal.throwIfAborted();
  // Images handles EXIF/HEIF orientation before resize. No explicit rotation:
  // applying EXIF again would rotate portrait photos twice. No crop/upscale.
  let result:Uint8Array | undefined;
  for(const quality of [82,72,62]) {
    signal.throwIfAborted();
    const output=await processor.input(file.stream()).transform({
      width:photoPipeline.maxOutputDimension,height:photoPipeline.maxOutputDimension,fit:'scale-down',
    }).output({format:'image/jpeg',quality,anim:false,background:'#ffffff'});
    signal.throwIfAborted();
    const response=output.response();
    if(!response.ok || !response.body || response.headers.get('content-type')?.split(';')[0]!=='image/jpeg') throw new Error('photo_processing_invalid_output');
    try { result=await readPhotoBytes(response.body,photoPipeline.maxOutputBytes,signal);break; }
    catch(error) {if(!(error instanceof Error) || error.message!=='photo_output_too_large') throw error;}
  }
  if(!result) throw new Error('photo_output_too_large');
  const image=sanitizeProcessedJpeg(result);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',image.bytes as Uint8Array<ArrayBuffer>));
  return {...image,byteSize:image.bytes.length,mimeType:'image/jpeg',extension:'jpg',sha256:[...digest].map(x=>x.toString(16).padStart(2,'0')).join('')};
}

// A fail-fast per-isolate resource guard, not a distributed billing rate limit.
// Retain the slot until unabortable Images calls settle, even after timeout.
let busy=false;
export async function withPhotoProcessing<T>(operation:(signal:AbortSignal)=>Promise<T>, cancel?:AbortSignal):Promise<T> {
  if(busy) throw new Error('photo_processing_busy');
  busy=true;
  const controller=new AbortController();
  const abort=()=>controller.abort(cancel?.reason ?? new Error('photo_processing_timeout'));
  const timer=setTimeout(()=>controller.abort(new Error('photo_processing_timeout')),photoPipeline.timeoutMs);
  cancel?.addEventListener('abort',abort,{once:true}); if(cancel?.aborted) abort();
  let started=false;
  try {
    controller.signal.throwIfAborted();
    const pending=operation(controller.signal);
    started=true;
    pending.finally(()=>{busy=false;}).catch(()=>{});
    return await new Promise<T>((resolve,reject)=>{
      const failed=()=>reject(controller.signal.reason);
      controller.signal.addEventListener('abort',failed,{once:true});
      pending.then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',failed)).catch(()=>{});
      if(controller.signal.aborted) failed();
    });
  } catch(error) { if(!started) busy=false; throw error; }
  finally {clearTimeout(timer);cancel?.removeEventListener('abort',abort);}
}
