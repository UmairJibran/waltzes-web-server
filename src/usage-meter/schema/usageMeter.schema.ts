import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UsageDocument = HydratedDocument<Usage>;

@Schema({
  timestamps: true,
})
export class Usage {
  @Prop()
  chargeBeeCustomerId: string;

  @Prop()
  chargeBeeSubscriptionId: string;

  @Prop()
  chargeBeeMeterResponse: string;

  @Prop()
  internalMetadata: string;

  @Prop()
  userInternalId: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const UsageSchema = SchemaFactory.createForClass(Usage);
