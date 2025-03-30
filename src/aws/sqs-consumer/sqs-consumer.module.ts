import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SqsModule } from '@ssut/nestjs-sqs';
import { SqsConsumerService } from './sqs-consumer.service';
import { availableQueues } from 'src/aws/sqs-producer/constant';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SesModule } from '../ses/ses.module';
import { UsageMeterModule } from 'src/usage-meter/usage-meter.module';

@Module({
  imports: [
    ConfigModule,
    SesModule,
    SqsModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const awsConfig: AwsConfig = await configService.getOrThrow('aws');
        return {
          producers: [],
          consumers: [
            {
              name: availableQueues.sendEmail,
              queueUrl: awsConfig.emailQueueUrl,
              region: awsConfig.region,
              pollingWaitTimeMs: 40000,
              sqs: new SQSClient({
                region: awsConfig.region,
                ...(awsConfig.endpoint && { endpoint: awsConfig.endpoint }),
                credentials: {
                  accessKeyId: awsConfig.accessKeyId,
                  secretAccessKey: awsConfig.secretAccessKey,
                },
              }),
            },
            {
              name: availableQueues.metering,
              queueUrl: awsConfig.meterQueueUrl,
              region: awsConfig.region,
              pollingWaitTimeMs: 40000,
              sqs: new SQSClient({
                region: awsConfig.region,
                ...(awsConfig.endpoint && { endpoint: awsConfig.endpoint }),
                credentials: {
                  accessKeyId: awsConfig.accessKeyId,
                  secretAccessKey: awsConfig.secretAccessKey,
                },
              }),
            },
          ],
        };
      },
    }),
    UsageMeterModule,
  ],
  providers: [SqsConsumerService],
})
export class SqsConsumerModule {}
