import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { RequestWithUser } from '../auth/request-with-user';
import { Roles } from '../auth/roles.decorator';
import { ResourcesService } from './resources.service';

@Controller()
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('directory/management')
  @Roles('BOSS', 'BOSS_VIEWER', 'ADMIN')
  listManagement() { return this.resources.listManagement(); }

  @Get('directory/employees')
  @Roles('BOSS', 'BOSS_VIEWER', 'ADMIN')
  listEmployees() { return this.resources.listEmployees(); }

  @Get('directory/members')
  @Roles('ADMIN')
  listMembers() { return this.resources.listMembers(); }

  @Post('admin/members') @Roles('ADMIN')
  addMember(@Body() body:Record<string,unknown>,@Req() request:RequestWithUser) { return this.resources.addMember(body,request.user!); }

  @Put('admin/members/:id/role') @Roles('ADMIN')
  changeRole(@Param('id') id:string,@Body() body:{role?:string},@Req() request:RequestWithUser) { return this.resources.changeMemberRole(id,String(body.role || ''),request.user!); }

  @Delete('admin/members/:id') @Roles('ADMIN')
  removeMember(@Param('id') id:string,@Req() request:RequestWithUser) { return this.resources.removeMember(id,request.user!); }

  @Put('admin/meeting-rooms/:id') @Roles('ADMIN')
  setRoom(@Param('id') id:string,@Body() body:{enabled?:boolean},@Req() request:RequestWithUser) { return this.resources.setRoomEnabled(id,body.enabled === true,request.user!); }

  @Get('meeting-rooms')
  @Roles('BOSS', 'BOSS_VIEWER', 'MANAGEMENT', 'ADMIN')
  listRooms() { return this.resources.listRooms(); }

  @Get('meeting-rooms/availability') @Roles('BOSS','BOSS_VIEWER','MANAGEMENT','ADMIN')
  availability(@Query('date') date:string,@Query('start') start:string,@Query('end') end:string) {
    return this.resources.roomAvailability(date,start,end);
  }

  @Get('admin/meeting-rooms') @Roles('ADMIN')
  listAllRooms() { return this.resources.listAllRooms(); }

  @Get('bosses/current/schedule')
  @Roles('BOSS', 'BOSS_VIEWER', 'MANAGEMENT', 'ADMIN')
  listCurrentSchedule(@Query('date') date:string,@Req() request:RequestWithUser,@Query('bossSpace') bossSpace?:string) {
    return this.resources.listCurrentBossSchedule(date,request.user!,bossSpace);
  }

  @Get('bosses/:bossId/schedule')
  @Roles('BOSS', 'BOSS_VIEWER', 'MANAGEMENT', 'ADMIN')
  listSchedule(
    @Param('bossId') bossId: string,
    @Query('date') date: string,
    @Req() request: RequestWithUser,
  ) {
    return this.resources.listBossSchedule(bossId, date, request.user!);
  }
}
