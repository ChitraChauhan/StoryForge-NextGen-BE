import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotificationType =
  | 'story.shared'
  | 'chapter.created'
  | 'chapter.deleted'
  | 'chapter.updated'
  | 'story.published'
  | 'ai.completed'
  | 'ai.failed';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actor?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Story' })
  story?: Types.ObjectId;

  @Prop({ required: true })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Date })
  readAt?: Date;

  @Prop({ required: true, unique: true })
  eventRecipientKey: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ eventRecipientKey: 1 }, { unique: true });
