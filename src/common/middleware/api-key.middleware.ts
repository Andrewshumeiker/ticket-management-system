import {
  Injectable,
  InternalServerErrorException,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * Middleware de API Key simple — reemplaza JWT en el MVP.
 * Valida el header: x-api-key: <API_KEY del .env>
 */
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers['x-api-key'];
    const apiKey = Array.isArray(header) ? header[0] : header;
    const validKey = this.config.get<string>('API_KEY');

    if (!validKey) {
      throw new InternalServerErrorException(
        'API authentication is not configured',
      );
    }

    if (!apiKey || !keysMatch(apiKey, validKey)) {
      throw new UnauthorizedException(
        'API Key inválida. Envía el header x-api-key correcto.',
      );
    }
    next();
  }
}

function keysMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
