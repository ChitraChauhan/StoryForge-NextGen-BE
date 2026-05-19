import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FailExportJobDto } from './dto/fail-export-job.dto';
import { ExportJobsService } from './export-jobs.service';

@Controller('internal/export-jobs')
export class ExportWorkerController {
  constructor(private readonly exportJobsService: ExportJobsService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claimNextJob(
    @Headers('authorization') authorization: string,
    @Headers('x-worker-instance-id') workerInstanceId: string,
  ) {
    this.exportJobsService.validateWorkerToken(authorization);
    return this.exportJobsService.claimNextJob(workerInstanceId);
  }

  @Post(':id/result')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadWorkerResult(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Headers('authorization') authorization: string,
  ) {
    this.exportJobsService.validateWorkerToken(authorization);
    return this.exportJobsService.completeJobWithPdf(id, file);
  }

  @Post(':id/fail')
  async failJob(
    @Param('id') id: string,
    @Body() dto: FailExportJobDto,
    @Headers('authorization') authorization: string,
  ) {
    this.exportJobsService.validateWorkerToken(authorization);
    return this.exportJobsService.failJob(id, dto);
  }
}
