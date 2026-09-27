import { HttpError } from '@/lib/auth';

const DEFAULT_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

type UploadRequestOptions = {
  maxFileBytes: number;
  missingContentLengthMessage: string;
  multipartOverheadBytes?: number;
};

export function assertUploadRequestSize(request: Request, options: UploadRequestOptions) {
  const contentLengthHeader = request.headers.get('content-length');
  if (!contentLengthHeader) {
    throw new HttpError(411, options.missingContentLengthMessage);
  }

  const contentLength = Number(contentLengthHeader);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new HttpError(400, 'Ukuran request upload tidak valid.');
  }

  const overhead = options.multipartOverheadBytes ?? DEFAULT_MULTIPART_OVERHEAD_BYTES;
  if (contentLength > options.maxFileBytes + overhead) {
    throw new HttpError(413, 'Ukuran request upload terlalu besar.');
  }
}
