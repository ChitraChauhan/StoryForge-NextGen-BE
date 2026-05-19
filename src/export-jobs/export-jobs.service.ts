import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ec2Service } from '../ec2/ec2.service';
import { Story, StoryDocument } from '../stories/schemas/story.schema';
import { S3StorageService } from '../storage/s3-storage.service';
import { CreateExportJobDto } from './dto/create-export-job.dto';
import { FailExportJobDto } from './dto/fail-export-job.dto';
import {
  ExportJob,
  ExportJobDocument,
  ExportJobFormat,
} from './schemas/export-job.schema';

@Injectable()
export class ExportJobsService {
  constructor(
    @InjectModel(ExportJob.name)
    private readonly exportJobModel: Model<ExportJobDocument>,
    @InjectModel(Story.name)
    private readonly storyModel: Model<StoryDocument>,
    private readonly ec2Service: Ec2Service,
    private readonly configService: ConfigService,
    private readonly s3StorageService: S3StorageService,
  ) {}

  async createForStory(
    storyId: string,
    dto: CreateExportJobDto,
    userId: string,
  ): Promise<{ job: ExportJobDocument; worker: Record<string, any> | null }> {
    const story = await this.requireStoryAccess(storyId, userId);
    const format = dto.format || 'pdf';

    const job = await this.exportJobModel.create({
      story: new Types.ObjectId(storyId),
      requestedBy: new Types.ObjectId(userId),
      format,
      status: 'queued',
      fileName: this.buildExportFileName(story.title, format),
    });

    const worker = await this.ensureWorkerReady(job);
    return {
      job: await this.findById(job._id.toString(), userId),
      worker,
    };
  }

  async listForStory(storyId: string, userId: string): Promise<ExportJobDocument[]> {
    await this.requireStoryAccess(storyId, userId);
    return this.exportJobModel
      .find({ story: new Types.ObjectId(storyId) })
      .populate('requestedBy', 'username email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string, userId: string): Promise<ExportJobDocument> {
    const job = await this.exportJobModel
      .findById(id)
      .populate('story', 'title author sharedWith')
      .populate('requestedBy', 'username email')
      .exec();

    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    const story = job.story as any;
    const authorId = story.author?._id?.toString?.() || story.author?.toString?.();
    const isShared = (story.sharedWith || []).some(
      (value: any) => (value._id?.toString?.() || value.toString?.()) === userId,
    );

    if (authorId !== userId && !isShared) {
      throw new ForbiddenException('Access denied');
    }

    return job;
  }

  async claimNextJob(workerInstanceId?: string): Promise<any | null> {
    const resolvedWorkerInstanceId = workerInstanceId
      || this.configService.get<string>('AWS_EC2_EXPORT_WORKER_INSTANCE_ID')
      || '';

    if (!resolvedWorkerInstanceId) {
      return null;
    }

    const job = await this.exportJobModel
      .findOneAndUpdate(
        {
          workerInstanceId: resolvedWorkerInstanceId,
          status: { $in: ['queued', 'starting_worker', 'worker_ready'] },
        },
        {
          $set: {
            status: 'processing',
            workerStartedAt: new Date(),
            errorMessage: '',
          },
        },
        {
          new: true,
          sort: { createdAt: 1 },
        },
      )
      .populate({
        path: 'story',
        populate: { path: 'author', select: 'username email' },
      })
      .populate('requestedBy', 'username email')
      .exec();

    if (!job) {
      return null;
    }

    return job;
  }

  async completeJobWithPdf(
    id: string,
    file: any,
  ): Promise<ExportJobDocument> {
    const job = await this.exportJobModel.findById(id).exec();
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    if (!file) {
      throw new BadRequestException('PDF file is required');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Worker result must be a PDF');
    }

    const story = await this.storyModel.findById(job.story).exec();
    if (!story) {
      throw new NotFoundException('Story not found');
    }

    const key = this.s3StorageService.buildStoryAssetKey(
      story._id.toString(),
      'exports',
      file.originalname || job.fileName || `${story.title}.pdf`,
    );
    const uploaded = await this.s3StorageService.uploadObject({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    story.pdfExports.push({
      fileName: file.originalname || job.fileName || `${story.title}.pdf`,
      url: uploaded.url,
      key: uploaded.key,
      exportedBy: new Types.ObjectId(job.requestedBy),
      createdAt: new Date(),
    });
    await story.save();

    job.fileName = file.originalname || job.fileName;
    job.resultUrl = uploaded.url;
    job.resultKey = uploaded.key;
    job.status = 'completed';
    job.completedAt = new Date();
    job.errorMessage = '';
    await job.save();

    return this.exportJobModel
      .findById(job._id)
      .populate('story', 'title')
      .populate('requestedBy', 'username email')
      .exec();
  }

  async failJob(id: string, dto: FailExportJobDto): Promise<ExportJobDocument> {
    const job = await this.exportJobModel.findById(id).exec();
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    job.status = 'failed';
    job.errorMessage = dto.errorMessage;
    await job.save();

    return this.exportJobModel
      .findById(job._id)
      .populate('story', 'title')
      .populate('requestedBy', 'username email')
      .exec();
  }

  validateWorkerToken(rawToken?: string): void {
    const configuredToken = this.configService.get<string>('EXPORT_WORKER_TOKEN') || '';
    if (!configuredToken) {
      throw new ForbiddenException('Export worker token is not configured');
    }

    const normalized = (rawToken || '').replace(/^Bearer\s+/i, '').trim();
    if (normalized !== configuredToken) {
      throw new ForbiddenException('Invalid export worker token');
    }
  }

  private async requireStoryAccess(storyId: string, userId: string): Promise<StoryDocument> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new BadRequestException('Invalid story id');
    }

    const story = await this.storyModel.findById(storyId).exec();
    if (!story) {
      throw new NotFoundException('Story not found');
    }

    const authorId = story.author.toString();
    const isShared = story.sharedWith.some((value: any) => value.toString() === userId);
    if (authorId !== userId && !isShared) {
      throw new ForbiddenException('Access denied');
    }

    return story;
  }

  private async ensureWorkerReady(
    job: ExportJobDocument,
  ): Promise<Record<string, any> | null> {
    const workerInstanceId = this.configService.get<string>('AWS_EC2_EXPORT_WORKER_INSTANCE_ID')
      || this.configService.get<string>('AWS_EC2_ALLOWED_INSTANCE_IDS')?.split(',')[0]?.trim()
      || '';

    if (!workerInstanceId) {
      return null;
    }

    const instance = await this.ec2Service.findInstance(workerInstanceId);
    let nextStatus: ExportJobDocument['status'] = 'queued';
    let action: 'start' | 'reuse' = 'reuse';
    let statusDetails: any = null;

    if (instance.state === 'stopped' || instance.state === 'stopping') {
      await this.ec2Service.startInstance(workerInstanceId);
      nextStatus = 'starting_worker';
      action = 'start';
    } else if (instance.state === 'running') {
      nextStatus = 'worker_ready';
      statusDetails = await this.ec2Service.getInstanceStatus(workerInstanceId);
    } else {
      nextStatus = 'starting_worker';
    }

    job.workerInstanceId = workerInstanceId;
    job.workerStartedAt = nextStatus === 'starting_worker' ? new Date() : job.workerStartedAt;
    job.status = nextStatus;
    await job.save();

    return {
      instanceId: workerInstanceId,
      instanceState: instance.state,
      action,
      status: nextStatus,
      details: statusDetails,
    };
  }

  private buildExportFileName(title: string, format: ExportJobFormat): string {
    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${safeTitle || 'storyforge-story'}.${format}`;
  }
}
