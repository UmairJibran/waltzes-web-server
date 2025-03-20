import { Injectable, Logger } from '@nestjs/common';
import Chargebee from 'chargebee';
import { Usage } from './schema/usageMeter.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsageMeterService {
  private readonly logger = new Logger(UsageMeterService.name);
  private readonly chargebee: Chargebee;

  constructor(
    @InjectModel(Usage.name) private usages: Model<Usage>,
    private readonly configService: ConfigService,
  ) {
    const chargeBeeSite: string =
      this.configService.getOrThrow('chargeBee.site');
    const chargeBeeApiKey: string =
      this.configService.getOrThrow('chargeBee.apiKey');
    this.chargebee = new Chargebee({
      site: chargeBeeSite,
      apiKey: chargeBeeApiKey,
    });
  }

  async createMeter(
    subscriptionId: string,
    customerId: string,
    itemPriceId: string,
    meterAmount: number = 1,
  ): Promise<void> {
    try {
      const res = await this.chargebee.usage.create(subscriptionId, {
        item_price_id: itemPriceId,
        quantity: meterAmount.toString(),
        usage_date: Math.floor(Date.now() / 1000),
      });
      await this.usages.create({
        chargeBeeCustomerId: customerId,
        chargeBeeSubscriptionId: subscriptionId,
        chargeBeeMeterResponse: JSON.stringify(res),
        internalMetadata: JSON.stringify({
          itemPriceId,
          meterAmount,
        }),
      });
      this.logger.log(`Meter created for subscription ${subscriptionId}`);
    } catch (e) {
      this.logger.error(`Error creating meter: ${e}`);
    }
  }
}
