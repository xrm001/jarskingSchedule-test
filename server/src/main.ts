import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { assertProductionConfiguration } from './config/production-config';

async function bootstrap(): Promise<void> {
  assertProductionConfiguration(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
