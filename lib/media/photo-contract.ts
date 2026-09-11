// Cloudflare Images binding limits, checked 2026-09-09. These are compressed
// input/remote-decoder limits, NOT permission to allocate this many RGBA pixels.
export const photoPipeline = {
  maxFiles: 7,
  maxSourceBytes: 20_000_000,
  maxSourcePixels: 100_000_000,
  maxSourceDimension: 12_000,
  maxOutputDimension: 2560,
  maxOutputBytes: 4 * 1024 * 1024,
  timeoutMs: 90_000,
} as const;

export const photoSourceAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
export function acceptedPhotoSource(file: File) {
  const type = file.type.toLowerCase();
  return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type)
    || ((!type || type === 'application/octet-stream') && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
}

export function photoOutputSize(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > photoPipeline.maxSourceDimension || height > photoPipeline.maxSourceDimension
    || width > Math.floor(photoPipeline.maxSourcePixels / height)) throw new Error('photo_processor_limit');
  const scale = Math.min(1, photoPipeline.maxOutputDimension / width, photoPipeline.maxOutputDimension / height);
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export async function readPhotoBytes(stream: ReadableStream<Uint8Array>, limit: number, signal: AbortSignal) {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    signal.throwIfAborted();
    while (true) {
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error('photo_output_too_large'); }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
