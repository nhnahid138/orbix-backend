import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import express from 'express';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { trustedOrigins } from './config/trusted-origins.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);
  const uploadsDir = resolve(
    config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads'),
  );
  await mkdir(uploadsDir, { recursive: true });
  app.use(
    '/media',
    express.static(uploadsDir, {
      dotfiles: 'deny',
      immutable: true,
      index: false,
      maxAge: '1y',
    }),
  );
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: trustedOrigins(config.getOrThrow<string>('CORS_ORIGINS')),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.get('TRUST_PROXY') === 'true' ? 1 : false);

  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Orbix Store API')
      .setDescription('Versioned e-commerce and admin API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(config.get<number>('PORT', 4000), '0.0.0.0');
}
await bootstrap();
