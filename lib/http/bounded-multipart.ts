export class MultipartRequestError extends Error {
  readonly code: "invalid_multipart" | "multipart_payload_too_large";

  constructor(code: "invalid_multipart" | "multipart_payload_too_large") {
    super(code);
    this.code = code;
  }
}

function parseContentLength(value: string | null) {
  if (value === null) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new MultipartRequestError("invalid_multipart");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new MultipartRequestError("multipart_payload_too_large");
  return parsed;
}

/**
 * Reads a multipart request through a hard byte ceiling before invoking the
 * platform FormData parser. The stream counter remains authoritative when a
 * missing or dishonest Content-Length header is received.
 */
export async function parseBoundedMultipartFormData(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new MultipartRequestError("invalid_multipart");
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new MultipartRequestError("multipart_payload_too_large");
  }
  if (!request.body) throw new MultipartRequestError("invalid_multipart");

  let totalBytes = 0;
  let overflowed = false;
  const boundedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        overflowed = true;
        throw new MultipartRequestError("multipart_payload_too_large");
      }
      controller.enqueue(chunk);
    },
  }));

  let form: FormData;
  try {
    form = await new Response(boundedBody, { headers: { "content-type": contentType } }).formData();
  } catch {
    if (overflowed) throw new MultipartRequestError("multipart_payload_too_large");
    throw new MultipartRequestError("invalid_multipart");
  }

  if (contentLength !== null && totalBytes !== contentLength) {
    throw new MultipartRequestError("invalid_multipart");
  }
  return form;
}
