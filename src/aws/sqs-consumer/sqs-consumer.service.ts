import type { Message } from '@aws-sdk/client-sqs';
import { Injectable, Logger } from '@nestjs/common';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import { availableQueues } from 'src/aws/sqs-producer/constant';
import { SesService } from '../ses/ses.service';
import { UsageMeterService } from 'src/usage-meter/usage-meter.service';

@Injectable()
export class SqsConsumerService {
  private readonly logger = new Logger(SqsConsumerService.name);
  constructor(
    private readonly sesService: SesService,
    private readonly usageMeterService: UsageMeterService,
  ) {}

  @SqsMessageHandler(availableQueues.sendEmail, false)
  async handleEmailMessages(message: Message) {
    if (message && message.Body) {
      this.logger.log(`Processing email message: ${message.MessageId}`);
      const messageParsed = JSON.parse(
        message.Body,
      ) as unknown as EmailQueueMessage;
      const { emailType, to } = messageParsed;
      this.logger.log(`Sending email to ${to} with type ${emailType}`);
      if (emailType === 'templated') {
        const { template, templateData, replyTo } = messageParsed;
        await this.sesService.sendTemplateEmail(
          to,
          template,
          templateData,
          replyTo,
        );
      }
      this.logger.log(`Email sent to ${to} with type ${emailType}`);
    }
  }

  @SqsMessageHandler(availableQueues.metering, false)
  async handleMetering(message: Message) {
    if (message && message.Body) {
      this.logger.log(`Processing meter message: ${message.MessageId}`);
      const messageParsed = JSON.parse(
        message.Body,
      ) as unknown as IMeterQueueMessage;
      const {
        subscriptionId,
        customerId,
        itemPriceId,
        userInternalId,
        meterAmount,
      } = messageParsed;
      this.logger.log(
        `Processing metering for subscription ${subscriptionId} and customer ${customerId}`,
      );
      await this.usageMeterService.createMeter(
        subscriptionId,
        customerId,
        itemPriceId,
        userInternalId,
        meterAmount,
      );
    }
  }
}
