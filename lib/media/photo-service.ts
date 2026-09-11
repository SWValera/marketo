import {env} from 'cloudflare:workers';
import type {PhotoProcessor} from './server-image-normalization.ts';

export function getListingImageProcessor(): PhotoProcessor {
  const processor=env.MARKETO_IMAGES as PhotoProcessor | undefined;
  if(!processor || typeof processor.input!=='function' || typeof processor.info!=='function') throw new Error('photo_processing_unavailable');
  return processor;
}

export function photoFailure(error: unknown) {
  const message=error instanceof Error ? error.message : '';
  const code=(error as {code?:number} | null)?.code;
  const reason=code===9413 ? 'photo_processor_limit' : [9412,9516].includes(code ?? 0) ? 'unsupported_image_content' : message;
  const statuses:Record<string,number>={
    photo_processor_limit:413, invalid_image_size:400, unsupported_image_content:400,
    image_mime_mismatch:400, photo_processing_busy:429, photo_processing_timeout:504,
  };
  const known=Object.hasOwn(statuses,reason);
  return {error:known ? reason : 'photo_processing_unavailable',status:known ? statuses[reason] : 503};
}
