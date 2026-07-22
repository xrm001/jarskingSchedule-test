import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DatabaseService } from '../database/database.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'connected' | 'not_configured' }> {
    const connected = await this.database.ping();
    return { status: 'ok', database: connected ? 'connected' : 'not_configured' };
  }
}
