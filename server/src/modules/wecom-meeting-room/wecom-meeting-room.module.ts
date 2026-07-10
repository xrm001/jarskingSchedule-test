import { Global, Module } from '@nestjs/common';
import { WeComMeetingRoomService } from './wecom-meeting-room.service';

@Global()
@Module({
  providers:[WeComMeetingRoomService],
  exports:[WeComMeetingRoomService],
})
export class WeComMeetingRoomModule {}
