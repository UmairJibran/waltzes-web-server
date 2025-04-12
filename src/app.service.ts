import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  ping(): string {
    this.logger.log('Processing ping request');
    const response = 'pong';
    this.logger.log('Successfully processed ping request');
    return response;
  }
}
