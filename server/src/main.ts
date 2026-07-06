import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { assertProductionConfiguration } from './config/production-config';
import { SessionService, type SessionRequest } from './modules/auth/session.service';

async function bootstrap(): Promise<void> {
  assertProductionConfiguration(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  const sessions = app.get(SessionService);
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request: SessionRequest) => {
    await sessions.authenticate(request);
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
