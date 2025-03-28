import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ApplicationsModule } from './applications/applications.module';
import { SqsProducerService } from './aws/sqs-producer/sqs-producer.service';
import { SqsProducerModule } from './aws/sqs-producer/sqs-producer.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SqsConsumerService } from './aws/sqs-consumer/sqs-consumer.service';
import { SqsConsumerModule } from './aws/sqs-consumer/sqs-consumer.module';
import { SesModule } from './aws/ses/ses.module';
import { S3Module } from './aws/s3/s3.module';
import { InternalController } from './_internal/_internal.controller';
import { JobsModule } from './jobs/jobs.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsageMeterService } from './usage-meter/usage-meter.service';
import { UsageMeterModule } from './usage-meter/usage-meter.module';
import configuration from './config';
import { ReqResMiddleware } from './req-res/req-res.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const mongoUrl: string = await configService.getOrThrow('mongoUrl');
        return {
          uri: mongoUrl,
        };
      },
    }),
    UsersModule,
    AuthModule,
    ApplicationsModule,
    SqsProducerModule,
    SqsConsumerModule,
    SesModule,
    S3Module,
    JobsModule,
    SubscriptionsModule,
    UsageMeterModule,
  ],
  controllers: [AppController, InternalController],
  providers: [
    AppService,
    SqsProducerService,
    SqsConsumerService,
    UsageMeterService,
  ],
  exports: [ConfigModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReqResMiddleware).forRoutes('*');
  }
}
