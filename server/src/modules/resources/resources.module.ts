import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { WeComMeetingRoomModule } from '../wecom-meeting-room/wecom-meeting-room.module';

@Module({ imports:[WeComMeetingRoomModule], controllers: [ResourcesController], providers: [ResourcesService] })
export class ResourcesModule {}
