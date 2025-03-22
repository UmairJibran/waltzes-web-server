import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Usage, UsageSchema } from './schema/usageMeter.schema';
import { UsageMeterService } from './usage-meter.service';
import { UsageMeterController } from './usage-meter.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Usage.name, schema: UsageSchema }]),
  ],
  providers: [UsageMeterService],
  exports: [UsageMeterService, MongooseModule],
  controllers: [UsageMeterController],
})
export class UsageMeterModule {}
