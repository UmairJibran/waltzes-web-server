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
    userInternalId: string,
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
        userInternalId,
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

  async getUsageByMonth(
    userId: string,
    month: number = new Date().getMonth() + 1,
    year: number = new Date().getFullYear(),
  ): Promise<
    Array<{
      date: string;
      documents: number;
    }>
  > {
    const usages = await this.usages.find({
      userInternalId: userId,
      createdAt: {
        $gte: new Date(`${year}-${month}-01`),
        $lt: new Date(`${year}-${month + 1}-01`),
      },
    });

    const groupedByDate: Record<string, number> = usages.reduce(
      (acc, usage) => {
        const date = new Date(usage.createdAt).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const allDatesOfMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= allDatesOfMonth; i++) {
      const date = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      if (!groupedByDate[date]) {
        groupedByDate[date] = 0;
      }
    }

    const sortedDates = Object.keys(groupedByDate).sort();

    return sortedDates.map((date) => ({
      date,
      documents: groupedByDate[date],
    }));
  }
}
