import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { SnsPublisherService } from './sns-publisher.service';
import { SesEmailService } from './ses-email.service';
import { UsersService } from '../users/users.service';
import { LambdaInvokerService } from './lambda-invoker.service';
import { CloudWatchMetricsService } from './cloudwatch-metrics.service';

interface EmitStoryEventInput {
  eventType: NotificationType;
  actorUserId: string;
  recipientUserIds: string[];
  storyId?: string;
  storyTitle?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectQueue('notifications')
    private readonly notificationQueue: Queue,
    private readonly snsPublisher: SnsPublisherService,
    private readonly sesEmailService: SesEmailService,
    private readonly usersService: UsersService,
    private readonly lambdaInvokerService: LambdaInvokerService,
    private readonly cloudWatchMetricsService: CloudWatchMetricsService,
  ) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const recipient = new Types.ObjectId(userId);
    const total = await this.notificationModel.countDocuments({ recipient });
    const unread = await this.notificationModel.countDocuments({
      recipient,
      readAt: { $exists: false },
    });
    const notifications = await this.notificationModel
      .find({ recipient })
      .populate('actor', 'username email')
      .populate('story', 'title status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    return { notifications, total, unread, page, pages: Math.ceil(total / limit) };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.notificationModel.countDocuments({
      recipient: new Types.ObjectId(userId),
      readAt: { $exists: false },
    });
    return { unread };
  }

  async markRead(id: string, userId: string): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        { _id: id, recipient: new Types.ObjectId(userId) },
        { $set: { readAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationModel.updateMany(
      { recipient: new Types.ObjectId(userId), readAt: { $exists: false } },
      { $set: { readAt: new Date() } },
    );
    return { updated: result.modifiedCount || 0 };
  }

  async clearAll(userId: string): Promise<{ deleted: number }> {
    const result = await this.notificationModel.deleteMany({
      recipient: new Types.ObjectId(userId),
    });
    return { deleted: result.deletedCount || 0 };
  }

  async emitStoryEvent(input: EmitStoryEventInput): Promise<void> {
    const recipients = [...new Set(input.recipientUserIds.filter(Boolean))].filter(
      (id) => id !== input.actorUserId,
    );
    if (recipients.length === 0) return;

    const eventId = this.buildEventId(input);
    const createdAt = new Date().toISOString();

    try {
      await this.notificationModel.insertMany(
        recipients.map((recipientId) => ({
          recipient: new Types.ObjectId(recipientId),
          actor: new Types.ObjectId(input.actorUserId),
          story: input.storyId ? new Types.ObjectId(input.storyId) : undefined,
          type: input.eventType,
          title: input.title,
          message: input.message,
          metadata: {
            ...input.metadata,
            chapterIndex: input.chapterIndex,
            chapterTitle: input.chapterTitle,
          },
          eventRecipientKey: `${eventId}:${recipientId}`,
        })),
        { ordered: false },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        this.logger.error(`Failed to store ${input.eventType} notifications`, error?.stack || error);
      }
    }

    const eventPayload = {
      eventId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      recipientUserIds: recipients,
      storyId: input.storyId,
      storyTitle: input.storyTitle,
      chapterIndex: input.chapterIndex,
      chapterTitle: input.chapterTitle,
      createdAt,
      metadata: input.metadata,
    };

    // Push to background queue for external alerts (Email, SNS, Lambda, Metrics)
    await this.notificationQueue.add('story-event', {
      eventPayload,
      input,
      recipients,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Queued background processing for event ${eventId}`);
  }

  // The following methods are kept as templates or for internal use if needed, 
  // but the primary processing now happens in NotificationsProcessor.
  
  private async sendEventEmails(
    input: EmitStoryEventInput,
    recipientIds: string[],
  ): Promise<void> {
    try {
      const actor = await this.usersService.findById(input.actorUserId);
      const actorName = actor?.username || 'Someone';

      await Promise.all(
        recipientIds.map(async (recipientId) => {
          const recipient = await this.usersService.findById(recipientId);

          if (!recipient?.email) return;

          await this.sesEmailService.sendEmail({
            to: recipient.email,
            subject: `StoryForge: ${input.title}`,
            text: this.buildTextEmail(input, actorName),
            html: this.buildHtmlEmail(input, actorName),
          });
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to send ${input.eventType} emails`, error?.stack || error);
    }
  }

  private buildTextEmail(input: EmitStoryEventInput, actorName: string): string {
    const storyLine = input.storyTitle ? `Story: ${input.storyTitle}\n` : '';
    const chapterLine = input.chapterTitle ? `Chapter: ${input.chapterTitle}\n` : '';
    return [
      input.title,
      '',
      input.message,
      '',
      `From: ${actorName}`,
      storyLine.trim(),
      chapterLine.trim(),
      '',
      'Open StoryForge to view the latest update.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildHtmlEmail(input: EmitStoryEventInput, actorName: string): string {
    const storyTitle = this.escapeHtml(input.storyTitle || 'StoryForge');
    const chapterTitle = input.chapterTitle
      ? `<p style="margin:0 0 12px;color:#5b4b73;"><strong>Chapter:</strong> ${this.escapeHtml(input.chapterTitle)}</p>`
      : '';

    return `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#241235;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;margin:0 0 12px;color:#4c1d95;">${this.escapeHtml(input.title)}</h1>
        <p style="margin:0 0 16px;color:#3f3154;">${this.escapeHtml(input.message)}</p>
        <div style="border-left:4px solid #7c3aed;padding:12px 16px;background:#f6f1ff;margin:20px 0;">
          <p style="margin:0 0 8px;color:#5b4b73;"><strong>Story:</strong> ${storyTitle}</p>
          ${chapterTitle}
          <p style="margin:0;color:#5b4b73;"><strong>From:</strong> ${this.escapeHtml(actorName)}</p>
        </div>
        <p style="font-size:13px;color:#7d6b96;">Open StoryForge to view the latest update.</p>
      </div>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private buildEventId(input: EmitStoryEventInput): string {
    return [
      input.eventType,
      input.storyId || 'none',
      input.chapterIndex ?? 'none',
      input.actorUserId,
      Date.now(),
    ].join(':');
  }
}
