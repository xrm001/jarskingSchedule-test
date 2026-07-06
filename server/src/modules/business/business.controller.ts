import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { RequestWithUser } from '../auth/request-with-user';
import { Roles } from '../auth/roles.decorator';
import { BusinessService } from './business.service';

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('boss/schedules/today') @Roles('BOSS')
  bossToday(@Req() req:RequestWithUser) { return this.business.bossToday(req.user!); }
  @Get('boss/approval-groups') @Roles('BOSS')
  approvals(@Req() req:RequestWithUser) { return this.business.bossApprovals(req.user!); }
  @Get('boss/reminders') @Roles('BOSS')
  reminders(@Req() req:RequestWithUser) { return this.business.reminders(req.user!); }
  @Post('boss/reminders/read-all') @Roles('BOSS')
  readReminders(@Req() req:RequestWithUser) { return this.business.markRemindersRead(req.user!); }
  @Post('boss/schedules') @Roles('BOSS')
  createSchedule(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>) { return this.business.createPersonalSchedule(req.user!,body); }
  @Put('boss/status') @Roles('BOSS')
  status(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>) { return this.business.changeBossStatus(req.user!,body); }
  @Get('boss/status/current') @Roles('BOSS','MANAGEMENT','ADMIN')
  currentStatus() { return this.business.currentBossStatus(); }

  @Post('meeting-requests') @Roles('MANAGEMENT')
  createRequest(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>) { return this.business.createMeetingRequest(req.user!,body); }
  @Get('meeting-requests/mine') @Roles('MANAGEMENT')
  mine(@Req() req:RequestWithUser) { return this.business.myRequests(req.user!); }
  @Post('meeting-requests/:id/cancel') @Roles('MANAGEMENT')
  cancel(@Req() req:RequestWithUser,@Param('id') id:string) { return this.business.cancelRequest(req.user!,id); }

  @Get('admin/meeting-requests') @Roles('ADMIN')
  adminRequests() { return this.business.adminRequests(); }
}
