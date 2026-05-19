import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import {
  UpdateStoryDto,
  CreateChapterDto,
  UpdateChapterDto,
  ShareStoryDto,
} from './dto/update-story.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.storiesService.findAll(
      user._id?.toString() || user.sub,
      Number(page),
      Number(limit),
    );
  }

  @Post()
  create(@Body() dto: CreateStoryDto, @CurrentUser() user: any) {
    return this.storiesService.create(dto, user._id?.toString() || user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.storiesService.findOne(id, user._id?.toString() || user.sub);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.update(id, dto, user._id?.toString() || user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.storiesService.remove(id, user._id?.toString() || user.sub);
  }

  @Post(':id/chapters')
  addChapter(
    @Param('id') id: string,
    @Body() dto: CreateChapterDto,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.addChapter(id, dto, user._id?.toString() || user.sub);
  }

  @Patch(':id/chapters/:index')
  updateChapter(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateChapterDto,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.updateChapter(
      id,
      Number(index),
      dto,
      user._id?.toString() || user.sub,
    );
  }

  @Delete(':id/chapters/:index')
  deleteChapter(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.deleteChapter(
      id,
      Number(index),
      user._id?.toString() || user.sub,
    );
  }

  @Post(':id/share')
  shareStory(
    @Param('id') id: string,
    @Body() dto: ShareStoryDto,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.shareStory(id, dto, user._id?.toString() || user.sub);
  }

  @Delete(':id/share/:userId')
  removeShare(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.removeShare(
      id,
      targetUserId,
      user._id?.toString() || user.sub,
    );
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadCoverImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.uploadCoverImage(
      id,
      file,
      user._id?.toString() || user.sub,
    );
  }

  @Post(':id/exports/pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadPdfExport(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.uploadPdfExport(
      id,
      file,
      user._id?.toString() || user.sub,
    );
  }

  @Post(':id/pdf-export')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadPdfExportAlias(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: any,
  ) {
    return this.storiesService.uploadPdfExport(
      id,
      file,
      user._id?.toString() || user.sub,
    );
  }
}
