import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import type { RequestWithUser } from '../auth/request-with-user';
import { DailySummaryService } from './daily-summary.service';
import { NotificationService } from './notification.service';

@Controller('admin/notifications')
@Roles('ADMIN')
export class NotificationController {
  constructor(private readonly notifications:NotificationService, private readonly dailySummary:DailySummaryService) {}

  @Post('test-message')
  testMessage(@Req() request:RequestWithUser) {
    return this.notifications.sendAdminTestMessage(request.user!);
  }

  @Post('process')
  process(@Query('limit') limit?:string) {
    return this.notifications.processPending(Number(limit || 20));
  }

  @Post('daily-summary/send')
  sendDailySummary() {
    return this.dailySummary.sendTodaySummary('manual');
  }

  @Get('outbox')
  outbox(@Query('limit') limit?:string) {
    return this.notifications.previewOutbox(Number(limit || 20));
  }
}
