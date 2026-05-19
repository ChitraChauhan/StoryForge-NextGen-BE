import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateExportJobDto } from './dto/create-export-job.dto';
import { ExportJobsService } from './export-jobs.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ExportJobsController {
  constructor(private readonly exportJobsService: ExportJobsService) {}

  @Post('stories/:id/export-jobs')
  createForStory(
    @Param('id') storyId: string,
    @Body() dto: CreateExportJobDto,
    @CurrentUser() user: any,
  ) {
    return this.exportJobsService.createForStory(
      storyId,
      dto,
      user._id?.toString() || user.sub,
    );
  }

  @Get('stories/:id/export-jobs')
  listForStory(@Param('id') storyId: string, @CurrentUser() user: any) {
    return this.exportJobsService.listForStory(
      storyId,
      user._id?.toString() || user.sub,
    );
  }

  @Get('export-jobs/:id')
  findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.exportJobsService.findById(id, user._id?.toString() || user.sub);
  }
}
