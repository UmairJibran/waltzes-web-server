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
      const response = await this.sqsService.send(queueName, {
        body: message,
        id: randomBytes(16).toString('hex'),
        deduplicationId: deduplicationId.slice(0, 128),
        groupId: groupId.slice(0, 128),
      });
      this.logger.debug(
        `Successfully produced message to queue: ${queueName} with message id: ${JSON.stringify(response)}`,
      );
    } catch (error) {
      console.log('error in producing message!', error);
    }
  }
}
