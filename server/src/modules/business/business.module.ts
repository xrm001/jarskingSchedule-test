import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { NotificationModule } from '../notifications/notification.module';
import { WeComMeetingRoomModule } from '../wecom-meeting-room/wecom-meeting-room.module';

@Module({ imports:[NotificationModule, WeComMeetingRoomModule], controllers:[BusinessController], providers:[BusinessService] })
export class BusinessModule {}
