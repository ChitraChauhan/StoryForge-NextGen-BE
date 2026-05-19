import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationEventPayload {
  eventId: string;
  eventType: string;
  actorUserId: string;
  recipientUserIds: string[];
  storyId?: string;
  storyTitle?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class SnsPublisherService {
  private readonly logger = new Logger(SnsPublisherService.name);

  constructor(private readonly configService: ConfigService) {}

  async publishStoryEvent(payload: NotificationEventPayload): Promise<void> {
    if (!this.isEnabled()) return;

    const topicArn = this.configService.get<string>('AWS_SNS_STORY_EVENTS_TOPIC_ARN');
    if (!topicArn) return;

    try {
      const aws = await this.loadAwsSnsClient();
      if (!aws) {
        this.logger.warn('SNS publish skipped because @aws-sdk/client-sns is not installed');
        return;
      }

      const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
      const client = new aws.SNSClient({ region });
      await client.send(
        new aws.PublishCommand({
          TopicArn: topicArn,
          Subject: `StoryForge ${payload.eventType}`,
          Message: JSON.stringify(payload),
          MessageAttributes: {
            eventType: { DataType: 'String', StringValue: payload.eventType },
            environment: {
              DataType: 'String',
              StringValue: this.configService.get<string>('NODE_ENV') || 'development',
            },
            channel: { DataType: 'String', StringValue: 'notification' },
          },
        }),
      );
    } catch (error) {
      this.logger.error(`SNS publish failed for ${payload.eventType}`, error?.stack || error);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('NOTIFICATIONS_ENABLED') !== 'false';
  }

  private async loadAwsSnsClient(): Promise<any | null> {
    try {
      const importer = new Function('specifier', 'return import(specifier)');
      return importer('@aws-sdk/client-sns');
    } catch {
      return null;
    }
  }
}
