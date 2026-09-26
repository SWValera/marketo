import {readPhotoBytes} from '../media/photo-contract.ts';
import {sanitizeProcessedJpeg} from '../media/processed-jpeg.ts';
import {hashTinyPng,PERCEPTUAL_ALGORITHM} from './perceptual-hash.ts';
export async function moderationDerivatives(bytes:Uint8Array,processor:Pick<ImagesBinding,'input'>,signal:AbortSignal,options:{vision:boolean;hash:boolean}){
 const stream=()=>new Blob([new Uint8Array(bytes)]).stream();
 const out:{vision?:Uint8Array;perceptual_hash?:string;algorithm?:typeof PERCEPTUAL_ALGORITHM}={};
 if(options.hash){signal.throwIfAborted();const response=(await processor.input(stream()).transform({width:9,height:8,fit:'squeeze'}).output({format:'image/png',anim:false,background:'#ffffff'})).response();
  if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('image/png'))throw new Error('hash_derivative_unavailable');
  out.perceptual_hash=await hashTinyPng(await readPhotoBytes(response.body,16_384,signal),signal);out.algorithm=PERCEPTUAL_ALGORITHM;
 }
 if(options.vision){signal.throwIfAborted();const response=(await processor.input(stream()).transform({width:1280,height:1280,fit:'scale-down'}).output({format:'image/jpeg',quality:75,anim:false,background:'#ffffff'})).response();
  if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('image/jpeg'))throw new Error('vision_derivative_unavailable');
  const image=sanitizeProcessedJpeg(await readPhotoBytes(response.body,512*1024,signal));if(image.width>1280||image.height>1280)throw new Error('invalid_derivative_dimensions');out.vision=image.bytes;
 }
 return out;
}
