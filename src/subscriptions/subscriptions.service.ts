import { Injectable, Logger } from '@nestjs/common';
import { Subscription } from './schema/subscription.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreationEventDto } from './dto/create-subscription.dto';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import { randomBytes } from 'crypto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptions: Model<Subscription>,
    private readonly sqsProducerService: SqsProducerService,
  ) {}

  async createSubscription(
    creationEvent: CreationEventDto,
  ): Promise<Subscription> {
    try {
      this.logger.debug(
        `Creating subscription for customer: ${creationEvent.content?.customer?.id}`,
      );
      const newSubscription = new this.subscriptions({
        eventId: creationEvent.id,
        customerId: creationEvent.content.customer.id,
        subscriptionId: creationEvent.content.subscription.id,
        activatedAt: creationEvent.content.subscription.activated_at,
        billingPeriod: creationEvent.content.subscription.billing_period,
        billingPeriodUnit:
          creationEvent.content.subscription.billing_period_unit,
        channel: creationEvent.content.subscription.channel,
        createdAt: creationEvent.content.subscription.created_at,
        currencyCode: creationEvent.content.subscription.currency_code,
        currentTermEnd: creationEvent.content.subscription.current_term_end,
        currentTermStart: creationEvent.content.subscription.current_term_start,
        deleted: creationEvent.content.subscription.deleted,
        dueInvoicesCount: creationEvent.content.subscription.due_invoices_count,
        email: creationEvent.content.customer.email,
        firstName: creationEvent.content.customer.first_name,
        hasScheduledAdvanceInvoices:
          creationEvent.content.subscription.has_scheduled_advance_invoices,
        hasScheduledChanges:
          creationEvent.content.subscription.has_scheduled_changes,
        lastName: creationEvent.content.customer.last_name,
        mrr: creationEvent.content.subscription.mrr,
        nextBillingAt: creationEvent.content.subscription.next_billing_at,
        object: creationEvent.content.subscription.object,
        resourceVersion: creationEvent.content.subscription.resource_version,
        startedAt: creationEvent.content.subscription.started_at,
        status: creationEvent.content.subscription.status,
        billingAddress: creationEvent.content.customer.billing_address,
        paymentMethod: creationEvent.content.customer.payment_method,
        subscriptionItems:
          creationEvent.content.subscription.subscription_items?.map((item) => {
            return {
              itemType: item.item_type,
              itemPriceId: item.item_price_id,
              meteredQuantity: item.metered_quantity,
              unitPrice: item.unit_price,
              freeQuantity: item.free_quantity,
            };
          }),
        updatedAt: creationEvent.content.subscription.updated_at,
        cancellationMetadata: JSON.stringify(creationEvent),
      });
      const savedSubscription = await newSubscription.save();
      this.logger.debug(
        `Successfully created subscription for customer: ${creationEvent.content?.customer?.id}`,
      );
      return savedSubscription;
    } catch (error) {
      this.logger.error(
        `Failed to create subscription for customer: ${creationEvent.content?.customer?.id}`,
        error,
      );
      throw error;
    }
  }

  async cancelSubscription(subscriptionEvent: CreationEventDto): Promise<void> {
    try {
      this.logger.debug(
        `Cancelling subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
      );
      await this.subscriptions.updateOne(
        { subscriptionId: subscriptionEvent.content.subscription.id },
        {
          status: 'cancelled',
          cancellationMetadata: JSON.stringify(subscriptionEvent),
        },
      );
      this.logger.debug(
        `Successfully cancelled subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error cancelling subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
        error,
      );
      throw error;
    }
  }

  async resumeSubscription(subscriptionEvent: CreationEventDto): Promise<void> {
    try {
      this.logger.debug(
        `Resuming subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
      );
      await this.subscriptions.updateOne(
        { subscriptionId: subscriptionEvent.content.subscription.id },
        {
          status: 'active',
          resumptionMetadata: JSON.stringify(subscriptionEvent),
        },
      );
      this.logger.debug(
        `Successfully resumed subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error resuming subscription for customer: ${subscriptionEvent.content?.customer?.id}`,
        error,
      );
      throw error;
    }
  }

  async findByEmail(
    email: string,
    { active }: { active: boolean },
  ): Promise<Subscription | null> {
    const query = { email };
    if (active) {
      query['status'] = 'active';
    }
    return this.subscriptions.findOne(query);
  }

  async meteredUsage(
    userEmail: string,
    userInternalId: string,
    meterAmount: number = 1,
  ): Promise<void> {
    const subscription = await this.subscriptions.findOne({
      email: userEmail,
      status: 'active',
    });
    if (!subscription) {
      this.logger.error(`Subscription not found for user ${userEmail}`);
      return;
    }

    const subscriptionId = subscription.subscriptionId;
    const customerId = subscription.customerId;
    const itemPriceId = subscription.subscriptionItems[0].itemPriceId;

    const payload: IMeterQueueMessage = {
      subscriptionId,
      customerId,
      itemPriceId,
      userInternalId,
      meterAmount,
    };

    await this.sqsProducerService.sendMessage(
      payload,
      'metering',
      randomBytes(16).toString('hex'), // deduplicationId - to make sure it is always unique
      [subscriptionId, customerId].join('-'), // groupId - to make sure multiple messages are processed in order
    );
  }
}
