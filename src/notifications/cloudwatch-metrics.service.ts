import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEventPayload } from './sns-publisher.service';

@Injectable()
export class CloudWatchMetricsService {
  private readonly logger = new Logger(CloudWatchMetricsService.name);

  constructor(private readonly configService: ConfigService) {}

  async publishStoryEventMetrics(payload: NotificationEventPayload): Promise<void> {
    if (!this.isEnabled()) return;

    const aws = await this.loadAwsCloudWatchClient();
    if (!aws) {
      this.logger.warn('CloudWatch metrics skipped because @aws-sdk/client-cloudwatch is not installed');
      return;
    }

    const region = this.configService.get<string>('AWS_CLOUDWATCH_REGION')
      || this.configService.get<string>('AWS_REGION')
      || 'us-east-1';
    const namespace = this.configService.get<string>('AWS_CLOUDWATCH_NAMESPACE')
      || 'StoryForge';
    const environment = this.configService.get<string>('NODE_ENV') || 'development';
    const client = new aws.CloudWatchClient({ region });

    try {
      await client.send(
        new aws.PutMetricDataCommand({
          Namespace: namespace,
          MetricData: [
            {
              MetricName: 'StoryEvents',
              Dimensions: [
                { Name: 'EventType', Value: payload.eventType },
                { Name: 'Environment', Value: environment },
              ],
              Unit: 'Count',
              Value: 1,
              Timestamp: new Date(payload.createdAt),
            },
            {
              MetricName: 'NotificationRecipients',
              Dimensions: [
                { Name: 'EventType', Value: payload.eventType },
                { Name: 'Environment', Value: environment },
              ],
              Unit: 'Count',
              Value: payload.recipientUserIds.length,
              Timestamp: new Date(payload.createdAt),
            },
          ],
        }),
      );
      this.logger.log(`CloudWatch metrics published for ${payload.eventType}`);
    } catch (error) {
      this.logger.error(`CloudWatch metrics failed for ${payload.eventType}`, error?.stack || error);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('CLOUDWATCH_METRICS_ENABLED') === 'true';
  }

  private async loadAwsCloudWatchClient(): Promise<any | null> {
    try {
      const importer = new Function('specifier', 'return import(specifier)');
      return importer('@aws-sdk/client-cloudwatch');
    } catch {
      return null;
    }
  }
}
