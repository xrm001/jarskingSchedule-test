import { Module } from '@nestjs/common';
import { DeepSeekVoiceService } from './deepseek-voice.service';
import { PersonCandidateService } from './person-candidate.service';
import { VoiceAnalysisController } from './voice-analysis.controller';
import { VoiceAnalysisService } from './voice-analysis.service';
import { WeComJsSdkService } from './wecom-jssdk.service';
import { AuthModule } from '../auth/auth.module';

@Module({imports:[AuthModule],controllers:[VoiceAnalysisController],providers:[DeepSeekVoiceService,PersonCandidateService,VoiceAnalysisService,WeComJsSdkService]})
export class VoiceAnalysisModule {}
