import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // WEB_URL = domínio(s) do frontend, separados por vírgula
  // Ex: https://g11b66....sslip.io
  // Se vazio ou *, reflete o Origin do pedido (OK para MVP Coolify)
  const raw = process.env.WEB_URL || process.env.CORS_ORIGIN || '*';
  const webOrigins = raw.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (webOrigins.includes('*')) return cb(null, true);
      if (webOrigins.includes(origin)) return cb(null, true);
      // fallback: reflect request origin (evita bloquear Coolify sslip.io)
      return cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('DocFlow API')
    .setDescription(
      'Multi-tenant SaaS for document management & reconciliation (Portugal)',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('tenants')
    .addTag('documents')
    .addTag('bank')
    .addTag('reconciliation')
    .addTag('integrations')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || process.env.PORT || 3001;
  await app.listen(port);
  console.log(`DocFlow API running on port ${port}`);
  console.log(`Swagger: /api/docs`);
}
bootstrap();
