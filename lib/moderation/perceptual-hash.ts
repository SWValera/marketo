import {readPhotoBytes} from '../media/photo-contract.ts';
export const PERCEPTUAL_ALGORITHM='dhash64-v1' as const;
export function hammingDistance(a:string,b:string){if(!/^[a-f0-9]{16}$/.test(a)||!/^[a-f0-9]{16}$/.test(b))throw new Error('invalid_hash');let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){x&=x-BigInt(1);n++;}return n;}
export function dhash64(gray:Uint8Array){if(gray.length!==72)throw new Error('invalid_hash_pixels');let hash=BigInt(0);for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash=(hash<<BigInt(1))|BigInt(gray[y*9+x]>gray[y*9+x+1]?1:0);return hash.toString(16).padStart(16,'0');}
export function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function paeth(a:number,b:number,c:number){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
/** Decodes only bounded 9x8, non-interlaced PNG derivatives from the trusted
 * Images binding. No native addon, canvas, or full-resolution pixel allocation. */
export async function hashTinyPng(bytes:Uint8Array,signal:AbortSignal){
 const bad=()=>new Error('invalid_hash_png');
 if(bytes.length>16_384||bytes.length<57||![137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))throw bad();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,depth=0,color=-1,channels=0,end=false;let palette:Uint8Array|undefined,alpha:Uint8Array|undefined;const compressed:Uint8Array[]=[];
 while(at+12<=bytes.length){const size=view.getUint32(at),type=new TextDecoder().decode(bytes.subarray(at+4,at+8));if(at+12+size>bytes.length||crc32(bytes.subarray(at+4,at+8+size))!==view.getUint32(at+8+size))throw bad();const data=bytes.subarray(at+8,at+8+size);
  if(type==='IHDR'){if(at!==8||size!==13||view.getUint32(at+8)!==9||view.getUint32(at+12)!==8||data[10]!==0||data[11]!==0||data[12]!==0)throw bad();depth=data[8];color=data[9];channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];if(!channels||![1,2,4,8,16].includes(depth)||(color!==0&&color!==3&&depth<8)||(color===3&&depth===16))throw bad();}
  else if(type==='PLTE')palette=data;
  else if(type==='tRNS')alpha=data;
  else if(type==='IDAT')compressed.push(data);
  else if(type==='IEND'){if(size!==0||at+12!==bytes.length)throw bad();end=true;break;}
  else if(type[0]===type[0].toUpperCase())throw bad();
  at+=12+size;
 }
 if(!end||!channels||!compressed.length)throw bad();
 const stride=Math.ceil(9*channels*depth/8),bpp=Math.max(1,Math.ceil(channels*depth/8));
 const data=await readPhotoBytes(new Blob(compressed.map(b=>new Uint8Array(b))).stream().pipeThrough(new DecompressionStream('deflate')),8*(stride+1),signal);
 if(data.length!==8*(stride+1))throw bad();
 const pixels=new Uint8Array(stride*8);
 for(let y=0;y<8;y++){const filter=data[y*(stride+1)];if(filter>4)throw bad();for(let x=0;x<stride;x++){const left=x>=bpp?pixels[y*stride+x-bpp]:0,up=y?pixels[(y-1)*stride+x]:0,ul=y&&x>=bpp?pixels[(y-1)*stride+x-bpp]:0;pixels[y*stride+x]=(data[y*(stride+1)+1+x]+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,ul):0))&255;}}
 const gray=new Uint8Array(72),max=2**depth-1;
 const sample=(y:number,n:number)=>{const bit=n*depth,index=y*stride+(bit>>3);return depth===16?pixels[index]*256+pixels[index+1]:depth===8?pixels[index]:(pixels[index]>>(8-depth-(bit%8)))&max;};
 for(let y=0;y<8;y++)for(let x=0;x<9;x++){
  let r:number,g:number,b:number,a=255;const n=x*channels,v=sample(y,n),scaled=(value:number)=>value*255/max;
  if(color===3){if(!palette||v*3+2>=palette.length)throw bad();r=palette[v*3];g=palette[v*3+1];b=palette[v*3+2];a=alpha?.[v]??255;}
  else if(color===0||color===4){r=g=b=scaled(v);if(color===4)a=scaled(sample(y,n+1));else if(alpha&&v===(alpha[0]*256+alpha[1]))a=0;}
  else{r=scaled(v);g=scaled(sample(y,n+1));b=scaled(sample(y,n+2));if(color===6)a=scaled(sample(y,n+3));else if(alpha&&v===alpha[0]*256+alpha[1]&&sample(y,n+1)===alpha[2]*256+alpha[3]&&sample(y,n+2)===alpha[4]*256+alpha[5])a=0;}
  gray[y*9+x]=Math.round(((299*r+587*g+114*b)/1000)*a/255+255-a);
 }
 return dhash64(gray);
}
