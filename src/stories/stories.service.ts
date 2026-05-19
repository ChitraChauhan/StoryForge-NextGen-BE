import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Story, StoryDocument } from './schemas/story.schema';
import { CreateStoryDto } from './dto/create-story.dto';
import {
  UpdateStoryDto,
  CreateChapterDto,
  UpdateChapterDto,
  ShareStoryDto,
} from './dto/update-story.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { S3StorageService } from '../storage/s3-storage.service';

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly s3StorageService: S3StorageService,
  ) { }

  async findAll(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ stories: StoryDocument[]; total: number; page: number; pages: number }> {
    const query = {
      $or: [
        { author: new Types.ObjectId(userId) },
        { sharedWith: new Types.ObjectId(userId) },
      ],
    };
    const total = await this.storyModel.countDocuments(query);
    const stories = await this.storyModel
      .find(query)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    return { stories, total, page, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();

    if (!story) throw new NotFoundException('Story not found');

    const authorId = story.author['_id']?.toString() || story.author.toString();
    const isShared = story.sharedWith.some(
      (u: any) => (u._id?.toString() || u.toString()) === userId,
    );
    if (authorId !== userId && !isShared) {
      throw new ForbiddenException('Access denied');
    }
    return story;
  }

  async create(dto: CreateStoryDto, userId: string): Promise<StoryDocument> {
    const story = new this.storyModel({
      ...dto,
      author: new Types.ObjectId(userId),
    });
    return story.save();
  }

  async update(id: string, dto: UpdateStoryDto, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can edit');

    const previousStatus = story.status;
    Object.assign(story, dto);
    const savedStory = await story.save();

    if (previousStatus !== 'published' && savedStory.status === 'published') {
      await this.notificationsService.emitStoryEvent({
        eventType: 'story.published',
        actorUserId: userId,
        recipientUserIds: savedStory.sharedWith.map((u: any) => u.toString()),
        storyId: savedStory._id.toString(),
        storyTitle: savedStory.title,
        title: 'Story published',
        message: `"${savedStory.title}" has been published.`,
      });
    }

    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async remove(id: string, userId: string): Promise<void> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can delete');
    await story.deleteOne();
  }

  async addChapter(id: string, dto: CreateChapterDto, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can add chapters');

    const order = story.chapters.length;
    story.chapters.push({
      title: dto.title,
      content: dto.content || '',
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const savedStory = await story.save();

    await this.notificationsService.emitStoryEvent({
      eventType: 'chapter.created',
      actorUserId: userId,
      recipientUserIds: savedStory.sharedWith.map((u: any) => u.toString()),
      storyId: savedStory._id.toString(),
      storyTitle: savedStory.title,
      chapterIndex: order,
      chapterTitle: dto.title,
      title: 'New chapter added',
      message: `A new chapter was added to "${savedStory.title}".`,
    });

    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async updateChapter(
    id: string,
    index: number,
    dto: UpdateChapterDto,
    userId: string,
  ): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');

    const authorId = story.author.toString();
    const isShared = story.sharedWith.some((u: any) => u.toString() === userId);
    if (authorId !== userId && !isShared) throw new ForbiddenException('Access denied');

    if (index < 0 || index >= story.chapters.length) {
      throw new BadRequestException('Chapter index out of range');
    }

    const chapter = story.chapters[index];
    if (dto.title !== undefined) chapter.title = dto.title;
    if (dto.content !== undefined) chapter.content = dto.content;
    chapter.updatedAt = new Date();

    story.markModified('chapters');
    const savedStory = await story.save();
    const recipients = [
      authorId,
      ...savedStory.sharedWith.map((u: any) => u.toString()),
    ];

    await this.notificationsService.emitStoryEvent({
      eventType: 'chapter.updated',
      actorUserId: userId,
      recipientUserIds: recipients,
      storyId: savedStory._id.toString(),
      storyTitle: savedStory.title,
      chapterIndex: index,
      chapterTitle: chapter.title,
      title: 'Chapter updated',
      message: `A chapter in "${savedStory.title}" was updated.`,
    });

    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async deleteChapter(id: string, index: number, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can delete chapters');

    if (index < 0 || index >= story.chapters.length) {
      throw new BadRequestException('Chapter index out of range');
    }

    const removedChapter = story.chapters.splice(index, 1)[0];

    // Re-order remaining chapters to ensure contiguous order
    story.chapters.forEach((ch, i) => {
      ch.order = i;
    });

    story.markModified('chapters');
    const savedStory = await story.save();

    await this.notificationsService.emitStoryEvent({
      eventType: 'chapter.deleted',
      actorUserId: userId,
      recipientUserIds: savedStory.sharedWith.map((u: any) => u.toString()),
      storyId: savedStory._id.toString(),
      storyTitle: savedStory.title,
      chapterIndex: index,
      chapterTitle: removedChapter.title,
      title: 'Chapter deleted',
      message: `A chapter was removed from "${savedStory.title}".`,
    });

    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async shareStory(id: string, dto: ShareStoryDto, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can share');

    const targetUser = await this.usersService.findById(dto.userId);
    if (!targetUser) throw new NotFoundException('User to share with not found');

    const alreadyShared = story.sharedWith.some(
      (u) => u.toString() === dto.userId,
    );
    // if (!alreadyShared) {
    story.sharedWith.push(new Types.ObjectId(dto.userId));
    await story.save();

    console.log("Story shared", story);
    await this.notificationsService.emitStoryEvent({
      eventType: 'story.shared',
      actorUserId: userId,
      recipientUserIds: [dto.userId],
      storyId: story._id.toString(),
      storyTitle: story.title,
      title: 'Story shared with you',
      message: `"${story.title}" was shared with you.`,
    });
    // }

    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async removeShare(id: string, targetUserId: string, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) throw new ForbiddenException('Only the author can manage sharing');

    story.sharedWith = story.sharedWith.filter(
      (u) => u.toString() !== targetUserId,
    );
    await story.save();

    // Always return populated result so frontend gets full user objects
    return this.storyModel
      .findById(id)
      .populate('author', 'username email')
      .populate('sharedWith', 'username email')
      .exec();
  }

  async uploadCoverImage(id: string, file: any, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');
    if (story.author.toString() !== userId) {
      throw new ForbiddenException('Only the author can update the cover image');
    }
    if (!file) throw new BadRequestException('Cover image is required');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Cover upload must be an image');
    }

    const key = this.s3StorageService.buildStoryAssetKey(
      story._id.toString(),
      'cover',
      file.originalname || 'cover-image',
    );
    const uploaded = await this.s3StorageService.uploadObject({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    story.coverImageUrl = uploaded.url;
    story.coverImageKey = uploaded.key;
    await story.save();

    return this.findOne(id, userId);
  }

  async uploadPdfExport(id: string, file: any, userId: string): Promise<StoryDocument> {
    const story = await this.storyModel.findById(id);
    if (!story) throw new NotFoundException('Story not found');

    const authorId = story.author.toString();
    const isShared = story.sharedWith.some((u: any) => u.toString() === userId);
    if (authorId !== userId && !isShared) throw new ForbiddenException('Access denied');
    if (!file) throw new BadRequestException('PDF file is required');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Export upload must be a PDF');
    }

    const key = this.s3StorageService.buildStoryAssetKey(
      story._id.toString(),
      'exports',
      file.originalname || `${story.title}.pdf`,
    );
    const uploaded = await this.s3StorageService.uploadObject({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    story.pdfExports.push({
      fileName: file.originalname || `${story.title}.pdf`,
      url: uploaded.url,
      key: uploaded.key,
      exportedBy: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined as any,
      createdAt: new Date(),
    });
    await story.save();

    return this.findOne(id, userId);
  }
}
