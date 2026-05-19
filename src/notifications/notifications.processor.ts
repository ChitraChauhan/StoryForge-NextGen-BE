import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SnsPublisherService } from './sns-publisher.service';
import { SesEmailService } from './ses-email.service';
import { UsersService } from '../users/users.service';
import { LambdaInvokerService } from './lambda-invoker.service';
import { CloudWatchMetricsService } from './cloudwatch-metrics.service';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly snsPublisher: SnsPublisherService,
    private readonly sesEmailService: SesEmailService,
    private readonly usersService: UsersService,
    private readonly lambdaInvokerService: LambdaInvokerService,
    private readonly cloudWatchMetricsService: CloudWatchMetricsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'story-event':
        return this.handleStoryEvent(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleStoryEvent(data: any) {
    const { eventPayload, input, recipients } = data;

    try {
      // 1. Invoke Lambda (for external integrations)
      await this.lambdaInvokerService.invokeStoryEvent(eventPayload);

      // 2. Publish to SNS
      await this.snsPublisher.publishStoryEvent(eventPayload);

      // 3. CloudWatch Metrics
      await this.cloudWatchMetricsService.publishStoryEventMetrics(eventPayload);

      // 4. Send Emails (The heaviest part)
      await this.sendEventEmails(input, recipients);

      this.logger.log(`Successfully processed background alerts for event ${eventPayload.eventId}`);
    } catch (error) {
      this.logger.error(`Failed to process background alerts for event ${eventPayload.eventId}`, error.stack);
      throw error; // This triggers BullMQ retry logic
    }
  }

  private async sendEventEmails(input: any, recipientIds: string[]): Promise<void> {
    const actor = await this.usersService.findById(input.actorUserId);
    const actorName = actor?.username || 'Someone';

    for (const recipientId of recipientIds) {
      try {
        const recipient = await this.usersService.findById(recipientId);
        if (!recipient?.email) continue;

        await this.sesEmailService.sendEmail({
          to: recipient.email,
          subject: `StoryForge: ${input.title}`,
          text: this.buildTextEmail(input, actorName),
          html: this.buildHtmlEmail(input, actorName),
        });
      } catch (error) {
        this.logger.error(`Failed to send email to ${recipientId}`, error.stack);
      }
    }
  }

  // Re-implementing formatting helpers (or we could expose them from service)
  // For simplicity in this step, I'll copy them or move them to a utility later.
  
  private buildTextEmail(input: any, actorName: string): string {
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

  private buildHtmlEmail(input: any, actorName: string): string {
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
}
