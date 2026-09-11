import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Deterministic size/format derivatives of the official supplied logo. Never
// redraw the artwork, stretch the source, or upscale it to invent detail.
const source=await readFile('assets/brand/jevu-logo-source.jpg');
const metadata=await sharp(source).metadata();
if(metadata.width<512||metadata.height<512)throw Error('Official source too small');
await mkdir('public/icons',{recursive:true});
const background='#ffffff';
for(const size of [16,32,180,192,512]){
 const name=size===180?'apple-touch-icon':`jevu-${size}-v1`;
 await sharp(source).rotate().resize(size,size,{fit:'contain',background,withoutEnlargement:true}).png().toFile(`public/icons/${name}.png`);
}
for(const size of [192,512]){
 const inset=Math.round(size*0.68);
 const logo=await sharp(source).rotate().resize(inset,inset,{fit:'contain',background,withoutEnlargement:true}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:3,background}}).composite([{input:logo,gravity:'centre'}]).png().toFile(`public/icons/jevu-maskable-${size}-v1.png`);
}
// ICO uses exact PNG entries: 16, 32 and 48 px, preserving alpha/colour.
const entries=[];
for(const size of [16,32,48])entries.push({size,bytes:await sharp(source).resize(size,size,{fit:'contain',background}).png().toBuffer()});
const header=Buffer.alloc(6+16*entries.length);header.writeUInt16LE(1,2);header.writeUInt16LE(entries.length,4);
let offset=header.length;
entries.forEach(({size,bytes},i)=>{const at=6+i*16;header[at]=size;header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length;});
await writeFile('public/favicon.ico',Buffer.concat([header,...entries.map(x=>x.bytes)]));
console.log(JSON.stringify({sourceSha256:createHash('sha256').update(source).digest('hex'),sourceWidth:metadata.width,sourceHeight:metadata.height,stretch:false,upscale:false}));
