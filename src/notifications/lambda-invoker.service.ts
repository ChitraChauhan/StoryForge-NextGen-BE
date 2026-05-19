import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEventPayload } from './sns-publisher.service';

@Injectable()
export class LambdaInvokerService {
  private readonly logger = new Logger(LambdaInvokerService.name);

  constructor(private readonly configService: ConfigService) {}

  async invokeStoryEvent(payload: NotificationEventPayload): Promise<void> {
    if (!this.isEnabled()) return;

    const functionName = this.configService.get<string>('AWS_LAMBDA_STORY_EVENTS_FUNCTION_NAME');
    if (!functionName) {
      this.logger.warn('Lambda invoke skipped because AWS_LAMBDA_STORY_EVENTS_FUNCTION_NAME is not configured');
      return;
    }

    const aws = await this.loadAwsLambdaClient();
    if (!aws) {
      this.logger.warn('Lambda invoke skipped because @aws-sdk/client-lambda is not installed');
      return;
    }

    const region = this.configService.get<string>('AWS_LAMBDA_REGION')
      || this.configService.get<string>('AWS_REGION')
      || 'us-east-1';
    const client = new aws.LambdaClient({ region });

    try {
      const result = await client.send(
        new aws.InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );
      this.logger.log(
        `Lambda invoked for ${payload.eventType}: ${functionName} (${result.StatusCode || 'unknown status'})`,
      );
    } catch (error) {
      this.logger.error(`Lambda invoke failed for ${payload.eventType}`, error?.stack || error);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('LAMBDA_STORY_EVENTS_ENABLED') === 'true';
  }

  private async loadAwsLambdaClient(): Promise<any | null> {
    try {
      const importer = new Function('specifier', 'return import(specifier)');
      return importer('@aws-sdk/client-lambda');
    } catch {
      return null;
    }
  }
}
