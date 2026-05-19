import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class SesEmailService {
  private readonly logger = new Logger(SesEmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(input: SendEmailInput): Promise<void> {
    if (!this.isEnabled()) return;

    const fromEmail = this.configService.get<string>('SES_FROM_EMAIL');
    if (!fromEmail) {
      this.logger.warn('SES email skipped because SES_FROM_EMAIL is not configured');
      return;
    }

    const aws = await this.loadAwsSesClient();
    if (!aws) {
      this.logger.warn('SES email skipped because @aws-sdk/client-ses is not installed');
      return;
    }

    const region = this.configService.get<string>('AWS_SES_REGION')
      || this.configService.get<string>('AWS_REGION')
      || 'us-east-1';
    const client = new aws.SESClient({ region });
    const configurationSetName = this.configService.get<string>('SES_CONFIGURATION_SET');

    try {
      await client.send(
        new aws.SendEmailCommand({
          Source: fromEmail,
          ConfigurationSetName: configurationSetName || undefined,
          Destination: {
            ToAddresses: [input.to],
          },
          Message: {
            Subject: {
              Data: input.subject,
              Charset: 'UTF-8',
            },
            Body: {
              Text: {
                Data: input.text,
                Charset: 'UTF-8',
              },
              Html: {
                Data: input.html,
                Charset: 'UTF-8',
              },
            },
          },
        }),
      );
    } catch (error) {
      this.logger.error(`SES email failed for ${input.to}`, error?.stack || error);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('EMAIL_NOTIFICATIONS_ENABLED') === 'true';
  }

  private async loadAwsSesClient(): Promise<any | null> {
    try {
      const importer = new Function('specifier', 'return import(specifier)');
      return importer('@aws-sdk/client-ses');
    } catch {
      return null;
    }
  }
}
