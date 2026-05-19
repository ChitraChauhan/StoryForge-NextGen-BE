import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { SnsPublisherService } from './sns-publisher.service';
import { SesEmailService } from './ses-email.service';
import { LambdaInvokerService } from './lambda-invoker.service';
import { CloudWatchMetricsService } from './cloudwatch-metrics.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    BullModule.registerQueue({
      name: 'notifications',
    }),
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    SnsPublisherService,
    SesEmailService,
    LambdaInvokerService,
    CloudWatchMetricsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
