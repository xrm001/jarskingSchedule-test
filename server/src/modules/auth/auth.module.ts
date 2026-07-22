import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { WeComClientService } from './wecom-client.service';

@Module({
  controllers:[AuthController],
  providers:[AuthService, SessionService, WeComClientService],
  exports:[SessionService,WeComClientService],
})
export class AuthModule {}
