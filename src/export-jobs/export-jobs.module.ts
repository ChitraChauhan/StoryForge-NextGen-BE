import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ec2Module } from '../ec2/ec2.module';
import { Story, StorySchema } from '../stories/schemas/story.schema';
import { StorageModule } from '../storage/storage.module';
import { ExportJobsController } from './export-jobs.controller';
import { ExportJobsService } from './export-jobs.service';
import { ExportWorkerController } from './export-worker.controller';
import { ExportJob, ExportJobSchema } from './schemas/export-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExportJob.name, schema: ExportJobSchema },
      { name: Story.name, schema: StorySchema },
    ]),
    Ec2Module,
    StorageModule,
  ],
  controllers: [ExportJobsController, ExportWorkerController],
  providers: [ExportJobsService],
  exports: [ExportJobsService],
})
export class ExportJobsModule {}
