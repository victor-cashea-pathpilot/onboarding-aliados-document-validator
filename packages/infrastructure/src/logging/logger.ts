import { inspect } from 'node:util';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LoggerLike {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function writeJson(level: LogLevel, logger: string, message: string, fields?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    severity: level,
    logger,
    message,
    ...(fields ?? {}),
  };

  process.stdout.write(`${JSON.stringify(payload, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  })}\n`);
}

export function createLogger(logger: string): LoggerLike {
  return {
    debug(message, fields) {
      writeJson('DEBUG', logger, message, fields);
    },
    info(message, fields) {
      writeJson('INFO', logger, message, fields);
    },
    warn(message, fields) {
      writeJson('WARN', logger, message, fields);
    },
    error(message, fields) {
      writeJson('ERROR', logger, message, fields);
    },
  };
}

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return inspect(error, { depth: 3, breakLength: 120 });
}
