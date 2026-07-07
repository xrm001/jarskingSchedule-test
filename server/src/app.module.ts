import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './modules/health/health.controller';
import { AuthenticationGuard } from './modules/auth/authentication.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { DatabaseModule } from './modules/database/database.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { AuthModule } from './modules/auth/auth.module';
import { CsrfGuard } from './modules/auth/csrf.guard';
import { BusinessModule } from './modules/business/business.module';
import { VoiceAnalysisModule } from './modules/voice/voice-analysis.module';
import { NotificationModule } from './modules/notifications/notification.module';

@Module({
  imports: [DatabaseModule, AuthModule, ApprovalsModule, ResourcesModule, BusinessModule, VoiceAnalysisModule, NotificationModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
