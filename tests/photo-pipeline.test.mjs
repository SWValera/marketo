import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {normalizeListingImage,assertPhotoSource,withPhotoProcessing} from '../lib/media/server-image-normalization.ts';
import {photoPipeline,readPhotoBytes} from '../lib/media/photo-contract.ts';
import {preparePhotoSelection,normalizeListingPhotoForUpload} from '../lib/media/client-image-normalization.ts';
import {sanitizeProcessedJpeg} from '../lib/media/processed-jpeg.ts';
import {photoFixture,localPhotoProcessor} from './helpers/photo-processor.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const signal=()=>new AbortController().signal;
const file=(b,type='image/jpeg')=>new File([b],'photo',{type});
const normalize=(f)=>normalizeListingImage(f,localPhotoProcessor(),signal());

test('seven photographs accepted, eighth reported; existing images also occupy slots',async()=>{
  const source=file(await photoFixture()); let active=0,peak=0;
  const prepare=async f=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return f;};
  const first=await preparePhotoSelection(Array(8).fill(source),0,prepare);
  assert.equal(photoPipeline.maxFiles,7);assert.equal(first.successes.length,7);assert.deepEqual(first.failures,['photo_limit_exceeded']);assert.equal(peak,1);
  const more=await preparePhotoSelection(Array(3).fill(source),6,prepare);
  assert.equal(more.successes.length,1);assert.deepEqual(more.failures,['photo_limit_exceeded']);
  const legacy=await preparePhotoSelection([source],12,prepare);
  assert.equal(legacy.successes.length,0);assert.deepEqual(legacy.failures,['photo_limit_exceeded']);
});

test('partial selection failure retains successes before and after the damaged file',async()=>{
  let index=0;
  const f=file(await photoFixture());
  const result=await preparePhotoSelection([f,f,f],0,async f=>{if(index++===1) throw Error('unsupported_image_content');return f;});
  assert.equal(result.successes.length,2);assert.deepEqual(result.failures,['unsupported_image_content']);
});

for(const [format,mime] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
  test(`real ${format} codec -> one metadata-free progressive JPEG`,async()=>{
    const result=await normalize(file(await photoFixture(600,400,format),mime));
    const meta=await sharp(result.bytes).metadata();
    assert.equal(result.mimeType,'image/jpeg');assert.equal(result.extension,'jpg');
    assert.equal(meta.width,600);assert.equal(meta.height,400);assert.equal(meta.exif,undefined);
    assert.equal(meta.icc,undefined);assert.equal(meta.isProgressive,true);
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
  });
}

test('real JPEG >12 MB is decoded and reduced on the server adapter',async()=>{
  const base=await photoFixture();
  const app=Buffer.alloc(60_004,65);app[0]=255;app[1]=225;app.writeUInt16BE(60_002,2);
  const large=Buffer.concat([base.subarray(0,2),...Array(220).fill(app),base.subarray(2)]);
  assert.ok(large.length>12*1024*1024);
  const result=await normalize(file(large));assert.ok(result.byteSize<100_000);
});

for(const [label,w,h] of [['12 MP',4000,3000],['24 MP',6000,4000],['48 MP',8064,6048],['50 MP',8192,6144],['100 MP',10000,10000],['wide',12000,600],['tall',600,12000]]) {
  test(`real JPEG ${label} retains aspect without cropping`,async()=>{
    // Release the native codec heap between large cases on 4 GB Windows hosts.
    // Dimensions, real decoding and result assertions are unchanged; no skips.
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./helpers/photo-large-codec.mjs',import.meta.url)),String(w),String(h)],
      {windowsHide:true,timeout:60000,maxBuffer:128*1024});
  });
}

for(const [label,w,h] of [['108 MP',12000,9000],['200 MP',16320,12240],['bomb',65535,65535]]) {
  test(`${label} exceeds the documented processor boundary before full decode`,async()=>{
    const f=file(await photoFixture()); let decodes=0;
    const processor={info:async()=>({width:w,height:h,format:'image/jpeg'}),input(){decodes++;throw Error('must not decode');}};
    await assert.rejects(normalizeListingImage(f,processor,signal()),/photo_processor_limit/);
    assert.equal(decodes,0);
  });
}

for(const orientation of [1,2,3,4,5,6,7,8]) {
  test(`EXIF ${orientation}: real pixel orientation and removal of camera metadata`,async()=>{
    const w=600,h=400,rgba=Buffer.alloc(w*h*3);
    const colors=[[240,10,10],[10,240,10],[10,10,240],[240,240,10]];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const color=colors[(y>=h/2?2:0)+(x>=w/2?1:0)];for(let c=0;c<3;c++)rgba[(y*w+x)*3+c]=color[c];
    }
    const original=await sharp(rgba,{raw:{width:w,height:h,channels:3}}).jpeg()
      .withMetadata({orientation}).withExifMerge({IFD0:{Make:'PrivateCamera',ImageDescription:'GPS test metadata'}}).toBuffer();
    assert.ok((await sharp(original).metadata()).exif);
    const result=await normalize(file(original));
    const meta=await sharp(result.bytes).metadata();
    assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);
    assert.equal(meta.width,orientation>=5?h:w);assert.equal(meta.height,orientation>=5?w:h);
    const pixel=await sharp(result.bytes).extract({left:Math.floor(meta.width/4),top:Math.floor(meta.height/4),width:1,height:1}).raw().toBuffer();
    const expected=colors[({1:0,2:1,3:3,4:2,5:0,6:2,7:3,8:1})[orientation]];
    expected.forEach((value,index)=>assert.ok(Math.abs(pixel[index]-value)<30));
    assert.equal(Buffer.from(result.bytes).includes(Buffer.from('PrivateCamera')),false);
  });
}

test('HEIC and HEIF MIME agree with HEVC container; this is NOT a HEIC codec test',async()=>{
  const bytes=Buffer.alloc(64);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write('heic',8);bytes.write('mif1',16);bytes.write('heic',20);
  for(const mime of ['image/heic','image/heif'])assert.equal(await assertPhotoSource(file(bytes,mime)),'image/heic');
  bytes.write('avif',20);await assert.rejects(assertPhotoSource(file(bytes,'image/heif')),/unsupported_image_content/);
});

test('fake MIME, corruption, arbitrary data and output with trailing data fail closed',async()=>{
  const jpeg=await photoFixture();
  await assert.rejects(normalize(file(jpeg,'image/png')),/image_mime_mismatch/);
  await assert.rejects(normalize(file(Buffer.alloc(100),'image/jpeg')),/unsupported_image_content/);
  await assert.rejects(normalize(file(jpeg.subarray(0,jpeg.length-70))));
  const result=await normalize(file(jpeg));
  assert.throws(()=>sanitizeProcessedJpeg(Buffer.concat([result.bytes,Buffer.from('payload')])),/invalid_output/);
});

test('structured GPS EXIF and private comments are stripped even if returned by the processor',async()=>{
  const jpeg=await photoFixture();
  // EXIF TIFF IFD0 -> GPS IFD, latitude N and three rational coordinates.
  const exif=Buffer.alloc(96);exif.write('Exif\0\0',0);exif.write('II',6);exif.writeUInt16LE(42,8);exif.writeUInt32LE(8,10);
  exif.writeUInt16LE(1,14);exif.writeUInt16LE(0x8825,16);exif.writeUInt16LE(4,18);exif.writeUInt32LE(1,20);exif.writeUInt32LE(26,24);
  exif.writeUInt16LE(2,32);exif.writeUInt16LE(1,34);exif.writeUInt16LE(2,36);exif.writeUInt32LE(2,38);exif.write('N\0',42);
  exif.writeUInt16LE(2,46);exif.writeUInt16LE(5,48);exif.writeUInt32LE(3,50);exif.writeUInt32LE(56,54);
  for(const [i,n] of [51,10,5].entries()){exif.writeUInt32LE(n,62+i*8);exif.writeUInt32LE(1,66+i*8);}
  const segment=Buffer.alloc(exif.length+4);segment[0]=255;segment[1]=225;segment.writeUInt16BE(exif.length+2,2);exif.copy(segment,4);
  const withGps=Buffer.concat([jpeg.subarray(0,2),segment,jpeg.subarray(2)]);
  assert.ok((await sharp(withGps).metadata()).exif);
  const result=sanitizeProcessedJpeg(withGps);
  assert.equal((await sharp(result.bytes).metadata()).exif,undefined);
  assert.deepEqual(result.bytes,sanitizeProcessedJpeg(jpeg).bytes);
});

test('only one processor operation per isolate; cancelled work cannot open another slot early',async()=>{
  let settle;const pending=new Promise(resolve=>settle=resolve);const controller=new AbortController();
  const first=withPhotoProcessing(()=>pending,controller.signal);controller.abort();
  await assert.rejects(first);
  await assert.rejects(withPhotoProcessing(async()=>1),/photo_processing_busy/);
  settle(1);await pending;await Promise.resolve();
  assert.equal(await withPhotoProcessing(async()=>2),2);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(withPhotoProcessing(async()=>1,cancelled.signal));
  assert.equal(await withPhotoProcessing(async()=>3),3);
});

test('stopped body is cancelled and oversized normalized output is rejected',async()=>{
  const controller=new AbortController();let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  const read=readPhotoBytes(body,100,controller.signal);controller.abort();await assert.rejects(read);assert.ok(cancelled);
  const f=new File([new Uint8Array(64)],'photo.jpg',{type:'image/jpeg'});
  await assert.rejects(normalizeListingPhotoForUpload(f,async()=>new Response(new Uint8Array(photoPipeline.maxOutputBytes+1),{headers:{'content-type':'image/jpeg'}})),/photo_output_too_large/);
});
