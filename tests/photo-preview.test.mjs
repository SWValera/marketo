import assert from 'node:assert/strict';
import test from 'node:test';
import {createPhotoPreview} from '../lib/media/photo-preview.ts';
import {photoFixture} from './helpers/photo-processor.mjs';

test('preview decodes only bounded normalized JPEG, makes a 640px thumbnail and releases the source URL/canvas',async()=>{
  const saved={document:globalThis.document,Image:globalThis.Image,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
  let created=0;const revoked=[];let encodedSize;let imageCount=0;
  const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(callback){encodedSize=[this.width,this.height];callback(new Blob([new Uint8Array(40)],{type:'image/jpeg'}));}};
  globalThis.document={createElement:()=>canvas};
  globalThis.Image=class{constructor(){imageCount++;}naturalWidth=2560;naturalHeight=1920;removeAttribute(){}set src(_url){queueMicrotask(()=>this.onload?.());}};
  URL.createObjectURL=()=>`blob:test-${++created}`;URL.revokeObjectURL=url=>revoked.push(url);
  try {
    const original=new File([new Uint8Array(13_000_000)],'phone.HEIC',{type:'image/heic'});
    await assert.rejects(createPhotoPreview(original,new AbortController().signal));assert.equal(imageCount,0);
    const file=new File([await photoFixture(2560,1920)],'photo.jpg',{type:'image/jpeg'});
    assert.equal(await createPhotoPreview(file,new AbortController().signal),'blob:test-2');
    assert.deepEqual(encodedSize,[640,480]);assert.deepEqual(revoked,['blob:test-1']);assert.equal(canvas.width,1);assert.equal(canvas.height,1);
  }finally{globalThis.document=saved.document;globalThis.Image=saved.Image;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
});
