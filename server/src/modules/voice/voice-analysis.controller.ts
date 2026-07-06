import { Body, Controller, Post, Req } from '@nestjs/common';
import type { RequestWithUser } from '../auth/request-with-user';
import { Roles } from '../auth/roles.decorator';
import { VoiceAnalysisService } from './voice-analysis.service';
import { WeComJsSdkService } from './wecom-jssdk.service';

@Controller('voice')
@Roles('BOSS', 'ADMIN')
export class VoiceAnalysisController {
  constructor(private readonly voice:VoiceAnalysisService,private readonly jssdk:WeComJsSdkService) {}

  @Post('parse-text')
  parse(@Req() request:RequestWithUser,@Body() body:Record<string,unknown>) { return this.voice.parseText(request.user!,body); }

  @Post('confirm-persons')
  confirm(@Req() request:RequestWithUser,@Body() body:Record<string,unknown>) { return this.voice.confirmPersons(request.user!,body); }

  @Post('wecom/signature')
  signature(@Body() body:{url?:string}) { return this.jssdk.signature(String(body.url||'')); }
}
