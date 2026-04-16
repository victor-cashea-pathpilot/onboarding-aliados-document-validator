import { getInfrastructureSettings } from '../config/settings';
import { createLogger } from '../logging/logger';
import { sanitizeUrl } from './sanitize-url';

const logger = createLogger('HttpDocumentDownloader');

export interface DownloadedDocument {
  url: string;
  bytes: Uint8Array;
  mimeType?: string | null;
  contentLength?: number | null;
}

export interface DocumentDownloader {
  download(url: string): Promise<DownloadedDocument>;
}

function normalizeContentType(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  return raw.split(';')[0]?.trim().toLowerCase() ?? null;
}

function parseContentLength(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export class HttpDocumentDownloader implements DocumentDownloader {
  private readonly timeoutSeconds: number;
  private readonly maxDocumentSizeBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    const settings = getInfrastructureSettings();
    this.fetchImpl = fetchImpl;
    this.timeoutSeconds = settings.downloadTimeoutSeconds;
    this.maxDocumentSizeBytes = settings.maxDocumentSizeBytes;
  }

  async download(url: string): Promise<DownloadedDocument> {
    const safeUrl = sanitizeUrl(url);
    const timeout = AbortSignal.timeout(this.timeoutSeconds * 1000);
    logger.info('document.download.started', {
      event: 'document.download.started',
      sourceUrl: safeUrl,
    });

    const response = await this.fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: timeout,
    });

    if (!response.ok) {
      throw new Error(`Document URL returned HTTP ${response.status}.`);
    }

    const mimeType = normalizeContentType(response.headers.get('content-type'));
    const declaredContentLength = parseContentLength(response.headers.get('content-length'));
    if (
      declaredContentLength !== null &&
      declaredContentLength > this.maxDocumentSizeBytes
    ) {
      throw new Error(`Document exceeds max size of ${this.maxDocumentSizeBytes} bytes.`);
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > this.maxDocumentSizeBytes) {
      throw new Error(`Document exceeds max size of ${this.maxDocumentSizeBytes} bytes.`);
    }

    logger.info('document.download.completed', {
      event: 'document.download.completed',
      sourceUrl: safeUrl,
      contentType: mimeType,
      contentLength: buffer.byteLength,
    });

    return {
      url,
      bytes: buffer,
      mimeType,
      contentLength: declaredContentLength ?? buffer.byteLength,
    };
  }
}
