import { Injectable, Logger } from '@nestjs/common';
import { Subscription } from './schema/subscription.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreationEventDto } from './dto/create-subscription.dto';
import { UsageMeterService } from 'src/usage-meter/usage-meter.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptions: Model<Subscription>,
    private readonly usageMeterService: UsageMeterService,
  ) {}

  async createSubscription(
    creationEvent: CreationEventDto,
  ): Promise<Subscription> {
    const newSubscription = new this.subscriptions({
      eventId: creationEvent.id,
      customerId: creationEvent.content.customer.id,
      subscriptionId: creationEvent.content.subscription.id,
      activatedAt: creationEvent.content.subscription.activated_at,
      billingPeriod: creationEvent.content.subscription.billing_period,
      billingPeriodUnit: creationEvent.content.subscription.billing_period_unit,
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
    return newSubscription.save();
  }

  async cancelSubscription(subscriptionEvent: CreationEventDto): Promise<void> {
    await this.subscriptions.updateOne(
      { subscriptionId: subscriptionEvent.content.subscription.id },
      {
        status: 'cancelled',
        cancellationMetadata: JSON.stringify(subscriptionEvent),
      },
    );
  }

  async resumeSubscription(subscriptionEvent: CreationEventDto): Promise<void> {
    await this.subscriptions.updateOne(
      { subscriptionId: subscriptionEvent.content.subscription.id },
      {
        status: 'active',
        resumptionMetadata: JSON.stringify(subscriptionEvent),
      },
    );
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

  async meteredUsageByUserEmail(
    userEmail: string,
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
    await this.usageMeterService.createMeter(
      subscription.subscriptionId,
      subscription.customerId,
      subscription.subscriptionItems[0].itemPriceId,
      meterAmount,
    );
  }
}
