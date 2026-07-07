import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({ imports:[NotificationModule], controllers:[BusinessController], providers:[BusinessService] })
export class BusinessModule {}
