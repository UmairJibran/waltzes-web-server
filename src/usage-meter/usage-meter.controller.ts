import { Controller, Get, Query } from '@nestjs/common';
import { UsageMeterService } from './usage-meter.service';
import { User } from 'src/auth/constants';

@Controller('usage-meter')
export class UsageMeterController {
  constructor(private readonly usageService: UsageMeterService) {}

  @Get()
  getUsageMeter(
    @Query('page')
    month: number,
    @Query('pageSize')
    year: number,
    @User() user: JwtPayload,
  ) {
    return this.usageService.getUsageByMonth(user.sub, month, year);
  }
}
