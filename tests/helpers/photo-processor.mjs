import sharp from 'sharp';
// Synthetic 48-100 MP fixture generation must not retain libvips tile caches
// between cases. This controls only the local test codec, not the application
// or the external Cloudflare service; pixel dimensions/assertions stay intact.
sharp.cache(false);
sharp.concurrency(1);
// Local real-codec adapter for the provider contract, NOT the Cloudflare
// service. Workerd's low-fidelity Images mock ignores EXIF and fit options.
export function localPhotoProcessor() {
  return {
    async info(stream) {
      const bytes=Buffer.from(await new Response(stream).arrayBuffer());
      const m=await sharp(bytes,{limitInputPixels:100_000_000}).metadata();
      return {format:'image/'+m.format,width:m.width,height:m.height,fileSize:bytes.length};
    },
    input(stream) {
      let options;
      return {
        transform(value){options=value;return this;},
        async output(value) {
          const bytes=Buffer.from(await new Response(stream).arrayBuffer());
          const result=await sharp(bytes,{limitInputPixels:100_000_000,failOn:'warning'})
            .rotate().resize({width:options.width,height:options.height,fit:'inside',withoutEnlargement:true})
            .flatten({background:value.background}).jpeg({quality:value.quality,progressive:true}).toBuffer();
          return {response:()=>new Response(result,{headers:{'content-type':'image/jpeg'}})};
        },
      };
    },
  };
}

export async function photoFixture(width=600,height=400,format='jpeg') {
  // Stream a constant tile through the encoder, instead of allocating an entire
  // 100 MP RGB create-image first. The resulting JPEG really is width x height:
  // tests decode it via the real application normalizer, not a fake size header.
  const image=sharp({create:{width:1,height:1,channels:3,background:'#d42812'}})
    .resize(width,height,{kernel:'nearest'});
  // libjpeg's optional Huffman optimization retains source DCT coefficients;
  // it exhausted this 4 GB host while *generating* the 100 MP test input.
  // Baseline JPEG without it has identical pixel dimensions and still needs
  // real full input decoding. Production output encoding is unchanged.
  return (format==='jpeg' ? image.jpeg({optimiseCoding:false}) : image.toFormat(format)).toBuffer();
}
