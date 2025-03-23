import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription, SubscriptionSchema } from './schema/subscription.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { SqsProducerModule } from 'src/aws/sqs-producer/sqs-producer.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    SqsProducerModule,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService, MongooseModule],
})
export class SubscriptionsModule {}
