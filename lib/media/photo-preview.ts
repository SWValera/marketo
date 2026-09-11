"use client";
import {sanitizeProcessedJpeg} from './processed-jpeg.ts';
import {photoPipeline} from './photo-contract.ts';

// Only a bounded, server-normalized JPEG reaches this decoder. Original HEIC,
// JPEG and PNG files are never used here. Seven previews retain <=12 MB RGBA
// instead of seven full 2560px decoded photographs (up to ~184 MB).
export async function createPhotoPreview(file: File, signal: AbortSignal):Promise<string> {
  if(file.size>photoPipeline.maxOutputBytes || file.type!=='image/jpeg') throw new Error('photo_preview_failed');
  const checked=sanitizeProcessedJpeg(new Uint8Array(await file.arrayBuffer()));
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), image=new Image();
    const canvas=document.createElement('canvas');
    let finished=false;
    const finish=(error?:unknown,preview?:Blob|null)=>{
      if(finished)return;finished=true;
      clearTimeout(timer);signal.removeEventListener('abort',abort);
      image.onload=null;image.onerror=null;image.removeAttribute('src');URL.revokeObjectURL(url);
      canvas.width=1;canvas.height=1;
      if(error || !preview)reject(error??new Error('photo_preview_failed'));
      else resolve(URL.createObjectURL(preview));
    };
    const abort=()=>finish(signal.reason??new Error('photo_preview_failed'));
    const timer=setTimeout(()=>finish(new Error('photo_preview_failed')),10000);
    signal.addEventListener('abort',abort,{once:true});
    image.onerror=()=>finish(new Error('photo_preview_failed'));
    image.onload=()=>{
      try {
        signal.throwIfAborted();
        if(image.naturalWidth!==checked.width || image.naturalHeight!==checked.height)throw new Error('photo_preview_failed');
        const scale=Math.min(1,640/checked.width,640/checked.height);
        canvas.width=Math.max(1,Math.round(checked.width*scale));canvas.height=Math.max(1,Math.round(checked.height*scale));
        const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('photo_preview_failed');
        context.drawImage(image,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>finish(undefined,blob),'image/jpeg',0.8);
      }catch(error){finish(error);}
    };
    image.decoding='async';image.src=url;
    if(signal.aborted)abort();
  });
}
