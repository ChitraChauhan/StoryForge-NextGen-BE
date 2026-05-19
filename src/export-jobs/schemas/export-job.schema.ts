import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExportJobDocument = ExportJob & Document;

export type ExportJobStatus =
  | 'queued'
  | 'starting_worker'
  | 'worker_ready'
  | 'processing'
  | 'completed'
  | 'failed';

export type ExportJobFormat = 'pdf' | 'docx' | 'zip';

@Schema({ timestamps: true })
export class ExportJob {
  @Prop({ type: Types.ObjectId, ref: 'Story', required: true, index: true })
  story: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  requestedBy: Types.ObjectId;

  @Prop({ required: true, enum: ['pdf', 'docx', 'zip'], default: 'pdf' })
  format: ExportJobFormat;

  @Prop({
    required: true,
    enum: ['queued', 'starting_worker', 'worker_ready', 'processing', 'completed', 'failed'],
    default: 'queued',
    index: true,
  })
  status: ExportJobStatus;

  @Prop({ default: '' })
  fileName: string;

  @Prop({ default: '' })
  resultUrl: string;

  @Prop({ default: '' })
  resultKey: string;

  @Prop({ default: '' })
  errorMessage: string;

  @Prop({ default: '' })
  workerInstanceId: string;

  @Prop({ type: Date })
  workerStartedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const ExportJobSchema = SchemaFactory.createForClass(ExportJob);

ExportJobSchema.index({ story: 1, createdAt: -1 });
ExportJobSchema.index({ requestedBy: 1, createdAt: -1 });
