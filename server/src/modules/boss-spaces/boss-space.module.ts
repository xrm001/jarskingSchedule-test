import { Global, Module } from '@nestjs/common';
import { BossSpaceService } from './boss-space.service';

@Global()
@Module({
  providers: [BossSpaceService],
  exports: [BossSpaceService],
})
export class BossSpaceModule {}
