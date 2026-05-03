import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: unknown;
  requestId?: string;
}

/**
 * Global exception filter.
 *
 * All unhandled exceptions are caught here. The filter:
 * - Returns the correct HTTP status for NestJS HttpExceptions.
 * - Returns a generic 500 for any other error so internal stack traces
 *   and implementation details are never leaked to clients.
 * - Logs unhandled (non-HTTP) exceptions server-side at ERROR level.
 * - Preserves the X-Request-Id header set by the request middleware.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = response.getHeader('X-Request-Id') as string | undefined;

    const { status, message, errors } = this.resolveError(exception);

    const body: ErrorResponseBody = { statusCode: status, message };

    if (errors !== undefined) {
      body.errors = errors;
    }

    if (requestId) {
      body.requestId = requestId;
    }

    response.status(status).json(body);
  }

  private resolveError(exception: unknown): {
    status: number;
    message: string;
    errors?: unknown;
  } {
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // Unknown / unhandled error — log server-side only, never expose details.
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred.',
    };
  }

  private resolveHttpException(exception: HttpException): {
    status: number;
    message: string;
    errors?: unknown;
  } {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return { status, message: exceptionResponse };
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;

      // class-validator returns message as a string array on validation errors.
      if (Array.isArray(resp['message'])) {
        return {
          status,
          message: 'Validation failed.',
          errors: resp['message'],
        };
      }

      const message =
        typeof resp['message'] === 'string'
          ? resp['message']
          : exception.message;

      return { status, message };
    }

    return { status, message: exception.message };
  }
}
