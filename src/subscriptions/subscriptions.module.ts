import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription, SubscriptionSchema } from './schema/subscription.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { UsageMeterModule } from 'src/usage-meter/usage-meter.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    UsageMeterModule,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService, MongooseModule],
})
export class SubscriptionsModule {}
