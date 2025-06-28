import { Module, forwardRef } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { SqsProducerModule } from 'src/aws/sqs-producer/sqs-producer.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { S3Module } from 'src/aws/s3/s3.module';
import { UsersModule } from 'src/users/users.module';
import { UsageMeterModule } from 'src/usage-meter/usage-meter.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Application.name, schema: ApplicationSchema },
    ]),
    SqsProducerModule,
    UsersModule,
    S3Module,
    UsageMeterModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService, MongooseModule],
})
export class ApplicationsModule {}
