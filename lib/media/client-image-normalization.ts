"use client";

import {acceptedPhotoSource, photoPipeline, readPhotoBytes} from './photo-contract.ts';

// Never assign the original to Image, canvas, or a preview object URL. A 108 MP
// RGBA decode would already exceed 400 MB before resizing can do anything.
export async function normalizeListingPhotoForUpload(file: File, transport: typeof fetch = fetch, cancel?: AbortSignal) {
  if (!acceptedPhotoSource(file)) throw new Error('unsupported_image_content');
  if (file.size < 32) throw new Error('invalid_image_size');
  if (file.size > photoPipeline.maxSourceBytes) throw new Error('photo_processor_limit');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('photo_processing_timeout')), photoPipeline.timeoutMs);
  const deadline = Date.now() + photoPipeline.timeoutMs;
  const abort = () => controller.abort(cancel?.reason);
  const resume = () => { if (Date.now() >= deadline) controller.abort(new Error('photo_processing_timeout')); };
  cancel?.addEventListener('abort', abort, {once:true});
  if (cancel?.aborted) abort();
  globalThis.addEventListener?.('pageshow', resume);
  globalThis.document?.addEventListener('visibilitychange', resume);
  try {
    const response = await transport('/api/photos/normalize', {
      method:'POST', body:file, credentials:'same-origin', signal:controller.signal,
      headers:{'content-type':file.type || 'application/octet-stream', accept:'image/jpeg'},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as {error?:unknown};
      const allowed = /^(authentication_required|photo_processor_limit|photo_processing_unavailable|photo_processing_busy|photo_processing_timeout|unsupported_image_content|image_mime_mismatch|invalid_image_size)$/;
      throw new Error(typeof body.error==='string' && allowed.test(body.error) ? body.error : 'photo_processing_unavailable');
    }
    if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new Error('photo_processing_unavailable');
    const bytes = await readPhotoBytes(response.body, photoPipeline.maxOutputBytes, controller.signal);
    if (bytes.length < 32) throw new Error('photo_processing_unavailable');
    // Original filenames / device timestamps are not sent or propagated.
    return new File([bytes as Uint8Array<ArrayBuffer>], 'photo.jpg', {type:'image/jpeg'});
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', abort);
    globalThis.removeEventListener?.('pageshow', resume);
    globalThis.document?.removeEventListener('visibilitychange', resume);
  }
}

// One failed file does not roll back other successfully prepared selections.
export async function preparePhotoSelection(files: readonly File[], existingCount: number,
  prepare: (file: File) => Promise<File> = normalizeListingPhotoForUpload) {
  const successes: File[] = [];
  const failures: string[] = [];
  for (const file of files) {
    if (existingCount + successes.length >= photoPipeline.maxFiles) { failures.push('photo_limit_exceeded'); break; }
    try { successes.push(await prepare(file)); }
    catch(error) {
      failures.push(error instanceof Error ? error.message : 'photo_processing_unavailable');
      if(error instanceof DOMException && error.name==='AbortError') break;
    }
  }
  return {successes, failures};
}
