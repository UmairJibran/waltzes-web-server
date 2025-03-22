import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/constants';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('ping')
  getHello(): string {
    try {
      this.logger.log('Fetching hello message');
      const result = this.appService.ping();
      this.logger.log('Successfully fetched hello message');
      return result;
    } catch (error) {
      this.logger.error('Failed to fetch hello message', error);
      throw error;
    }
  }
}
