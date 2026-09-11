import {photoPipeline} from './photo-contract.ts';

/** Only for bytes obtained from the trusted server decoder, never raw uploads.
 * Validates bounded JPEG framing and removes ALL APP/COM segments, including
 * metadata between progressive scans. Pixel decodability is the processor's job.
 */
export function sanitizeProcessedJpeg(bytes: Uint8Array) {
  const invalid = () => new Error('photo_processing_invalid_output');
  if (bytes.length < 32 || bytes.length > photoPipeline.maxOutputBytes || bytes[0] !== 255 || bytes[1] !== 216) throw invalid();
  const parts: Uint8Array[] = [bytes.subarray(0,2)];
  let offset=2, width=0, height=0, scans=0, markers=0;
  while(offset < bytes.length && ++markers <= 4096) {
    const start=offset;
    if(bytes[offset++] !== 255) throw invalid();
    while(bytes[offset] === 255) offset++;
    const marker=bytes[offset++];
    if(marker === 217) {
      if(!width || !scans || offset !== bytes.length) throw invalid();
      parts.push(bytes.subarray(start,offset));
      const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
      let at=0; for(const part of parts){result.set(part,at);at+=part.length;}
      return {bytes:result,width,height};
    }
    if(offset+2 > bytes.length) throw invalid();
    const size=bytes[offset]*256+bytes[offset+1], end=offset+size;
    if(size<2 || end>bytes.length) throw invalid();
    if(marker===192 || marker===194) {
      if(width || size<11 || bytes[offset+2]!==8) throw invalid();
      height=bytes[offset+3]*256+bytes[offset+4]; width=bytes[offset+5]*256+bytes[offset+6];
      if(width<1 || height<1 || width>photoPipeline.maxOutputDimension || height>photoPipeline.maxOutputDimension
        || ![1,3].includes(bytes[offset+7]) || size!==8+bytes[offset+7]*3) throw invalid();
    } else if (![196,219,221,218,254].includes(marker) && !(marker>=224 && marker<=239)) throw invalid();
    if(!((marker>=224 && marker<=239) || marker===254)) parts.push(bytes.subarray(start,end));
    offset=end;
    if(marker===218) {
      if(!width || size<6) throw invalid();
      scans++;
      const entropyStart=offset;
      while(offset<bytes.length) {
        if(bytes[offset]!==255){offset++;continue;}
        const next=bytes[offset+1];
        if(next===0 || (next>=208 && next<=215)){offset+=2;continue;}
        break;
      }
      if(offset===entropyStart) throw invalid();
      parts.push(bytes.subarray(entropyStart,offset));
    }
  }
  throw invalid();
}
