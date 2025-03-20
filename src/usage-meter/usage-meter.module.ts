import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Usage, UsageSchema } from './schema/usageMeter.schema';
import { UsageMeterService } from './usage-meter.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Usage.name, schema: UsageSchema }]),
  ],
  providers: [UsageMeterService],
  exports: [UsageMeterService, MongooseModule],
})
export class UsageMeterModule {}
