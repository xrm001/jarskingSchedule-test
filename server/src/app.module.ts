import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './modules/health/health.controller';
import { AuthenticationGuard } from './modules/auth/authentication.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { ApprovalsModule } from './modules/approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
