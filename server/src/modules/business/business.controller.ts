import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { RequestWithUser } from '../auth/request-with-user';
import { Roles } from '../auth/roles.decorator';
import { BusinessService } from './business.service';

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('boss/schedules/today') @Roles('BOSS','BOSS_VIEWER')
  bossToday(@Req() req:RequestWithUser, @Query('bossSpace') bossSpace?:string) { return this.business.bossToday(req.user!, bossSpace); }
  @Get('boss/approval-groups') @Roles('BOSS','BOSS_VIEWER')
  approvals(@Req() req:RequestWithUser, @Query('bossSpace') bossSpace?:string) { return this.business.bossApprovals(req.user!, bossSpace); }
  @Get('boss/reminders') @Roles('BOSS','BOSS_VIEWER')
  reminders(@Req() req:RequestWithUser) { return this.business.reminders(req.user!); }
  @Post('boss/reminders/read-all') @Roles('BOSS')
  readReminders(@Req() req:RequestWithUser) { return this.business.markRemindersRead(req.user!); }
  @Post('boss/schedules') @Roles('BOSS')
  createSchedule(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>, @Query('bossSpace') bossSpace?:string) { return this.business.createPersonalSchedule(req.user!,body,bossSpace); }
  @Put('boss/schedules/:id') @Roles('BOSS')
  updateSchedule(@Req() req:RequestWithUser,@Param('id') id:string,@Body() body:Record<string,unknown>, @Query('bossSpace') bossSpace?:string) { return this.business.updateBossSchedule(req.user!,id,body,bossSpace); }
  @Post('boss/schedules/:id/cancel') @Roles('BOSS')
  cancelSchedule(@Req() req:RequestWithUser,@Param('id') id:string, @Query('bossSpace') bossSpace?:string) { return this.business.cancelBossSchedule(req.user!,id,bossSpace); }
  @Put('boss/status') @Roles('BOSS')
  status(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>, @Query('bossSpace') bossSpace?:string) { return this.business.changeBossStatus(req.user!,body,bossSpace); }
  @Post('boss/organized-meetings') @Roles('BOSS')
  organizeMeeting(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>, @Query('bossSpace') bossSpace?:string) { return this.business.organizeMeeting(req.user!,body,bossSpace); }
  @Get('boss/status/current') @Roles('BOSS','BOSS_VIEWER','MANAGEMENT','ADMIN')
  currentStatus(@Req() req:RequestWithUser, @Query('bossSpace') bossSpace?:string) { return this.business.currentBossStatus(req.user!, bossSpace); }

  @Post('meeting-requests') @Roles('MANAGEMENT')
  createRequest(@Req() req:RequestWithUser,@Body() body:Record<string,unknown>, @Query('bossSpace') bossSpace?:string) { return this.business.createMeetingRequest(req.user!,body,bossSpace); }
  @Get('meeting-requests/mine') @Roles('MANAGEMENT')
  mine(@Req() req:RequestWithUser) { return this.business.myRequests(req.user!); }
  @Post('meeting-requests/:id/cancel') @Roles('MANAGEMENT')
  cancel(@Req() req:RequestWithUser,@Param('id') id:string) { return this.business.cancelRequest(req.user!,id); }

  @Get('admin/meeting-requests') @Roles('ADMIN')
  adminRequests() { return this.business.adminRequests(); }
}
