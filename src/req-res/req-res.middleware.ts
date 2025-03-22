import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ReqResMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startAt = process.hrtime();
    const { ip, method, originalUrl } = request;
    const userAgent = request.get('user-agent') || 'No user-agent';

    response.on('finish', () => {
      const { statusCode } = response;
      const contentLength =
        response.get('content-length') ||
        response.getHeaders()['content-length'];
      const diff = process.hrtime(startAt);
      const responseTime = diff[0] * 1e3 + diff[1] * 1e-6;
      if (statusCode >= 400) {
        const errorMessage = response.statusMessage;
        this.logger.error(
          `${method} - ${responseTime}ms ${originalUrl} ${statusCode} ${contentLength} ${errorMessage} - ${userAgent} ${ip}`,
        );
      } else {
        this.logger.log(
          `${method} - ${responseTime}ms ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`,
        );
      }
    });

    next();
  }
}
