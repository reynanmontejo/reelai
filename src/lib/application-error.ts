export type ApplicationErrorCode =
  | 'CATALOG_UNAVAILABLE'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'SERIES_NOT_FOUND'
  | 'EPISODE_NOT_FOUND'
  | 'SOURCE_EXPIRED'
  | 'SOURCE_FORBIDDEN'
  | 'UNSUPPORTED_STREAM_TYPE'
  | 'MALFORMED_PROVIDER_RESPONSE'
  | 'INVALID_RESOLVER_REQUEST'
  | 'ALL_SOURCES_FAILED'
  | 'INVALID_BACKEND_CONFIGURATION'
  | 'INVALID_CONTENT_DATA'
  | 'STREAM_NOT_FOUND';

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ApplicationError';
    this.context = options?.context;
  }

  readonly context?: Record<string, unknown>;
}

export function catalogUnavailable(operation: string, cause?: unknown) {
  return new ApplicationError('CATALOG_UNAVAILABLE', 'The catalog is temporarily unavailable.', {
    cause,
    context: { operation },
  });
}
