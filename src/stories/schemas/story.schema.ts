import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoryDocument = Story & Document;

@Schema({ timestamps: true })
export class Story {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({
    type: [
      {
        title: { type: String, required: true },
        content: { type: String, default: '' },
        order: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  chapters: Array<{
    title: string;
    content: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

  @Prop({
    type: String,
    enum: ['draft', 'published', 'archived', 'primary'],
    default: 'draft',
  })
  status: string;

  @Prop({ default: '' })
  coverImageUrl: string;

  @Prop({ default: '' })
  coverImageKey: string;

  @Prop({
    type: [
      {
        fileName: { type: String, required: true },
        url: { type: String, required: true },
        key: { type: String, required: true },
        exportedBy: { type: Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  pdfExports: Array<{
    fileName: string;
    url: string;
    key: string;
    exportedBy: Types.ObjectId;
    createdAt: Date;
  }>;
}

export const StorySchema = SchemaFactory.createForClass(Story);

// Index for fast author-based queries
StorySchema.index({ author: 1 });
StorySchema.index({ sharedWith: 1 });
