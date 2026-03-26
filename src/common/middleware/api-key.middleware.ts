import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de API Key simple — reemplaza JWT en el MVP.
 * Valida el header: x-api-key: <API_KEY del .env>
 */
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.API_KEY ?? 'power-automate-secret-key-2026';

    if (!apiKey || apiKey !== validKey) {
      throw new UnauthorizedException(
        'API Key inválida. Envía el header x-api-key correcto.',
      );
    }
    next();
  }
}
