import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface UploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

interface UploadResult {
  key: string;
  url: string;
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async uploadObject(input: UploadInput): Promise<UploadResult> {
    const bucket = this.configService.get<string>('AWS_S3_BUCKET');
    if (!bucket) {
      throw new ServiceUnavailableException('S3 bucket is not configured');
    }

    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const client = new S3Client({
      region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    } catch (error) {
      this.logger.error(`S3 upload failed for ${input.key}`, error?.stack || error);
      throw new ServiceUnavailableException('S3 upload failed');
    }

    return {
      key: input.key,
      url: this.buildObjectUrl(bucket, region, input.key),
    };
  }

  buildStoryAssetKey(storyId: string, folder: string, originalName: string): string {
    const safeName = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `stories/${storyId}/${folder}/${Date.now()}-${safeName || 'asset'}`;
  }

  private buildObjectUrl(bucket: string, region: string, key: string): string {
    const baseUrl = this.configService.get<string>('AWS_S3_PUBLIC_BASE_URL');
    if (baseUrl) return `${baseUrl.replace(/\/$/, '')}/${key}`;
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
