import { randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { SqsService } from '@ssut/nestjs-sqs';
import { availableQueues } from './constant';

@Injectable()
export class SqsProducerService {
  private readonly logger = new Logger(SqsProducerService.name);
  constructor(private readonly sqsService: SqsService) {}

  async sendMessage(
    body: object,
    queueName: keyof typeof availableQueues,
    deduplicationId: string,
    groupId: string,
  ) {
    const message: string = JSON.stringify(body);

    try {
      if (deduplicationId.length > 128) {
        this.logger.warn(
          `Deduplication ID truncated to 128 characters, was: ${deduplicationId}, is now: ${deduplicationId.slice(
            0,
            128,
          )}`,
        );
      }
      if (groupId.length > 128) {
        this.logger.warn(
          `Group ID truncated to 128 characters, was ${groupId}, is now: ${groupId.slice(0, 128)}`,
        );
      }
      const response = await this.sqsService.send(queueName, {
        body: message,
        id: randomBytes(16).toString('hex'),
        deduplicationId: deduplicationId.slice(0, 128),
        groupId: groupId.slice(0, 128),
      });
      this.logger.log(
        `Successfully produced message to queue: ${queueName} with message id: ${JSON.stringify(response)}`,
      );
    } catch (error) {
      console.log('error in producing message!', error);
    }
  }
}
