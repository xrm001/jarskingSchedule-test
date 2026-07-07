import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DailySummaryService } from './daily-summary.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports:[AuthModule],
  controllers:[NotificationController],
  providers:[NotificationService, DailySummaryService],
  exports:[NotificationService, DailySummaryService],
})
export class NotificationModule {}
