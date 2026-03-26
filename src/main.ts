import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Prefijo global de API
  app.setGlobalPrefix('api/v1');

  // ── Validación global de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // elimina campos no declarados en el DTO
      forbidNonWhitelisted: true,
      transform: true,       // convierte payloads al tipo del DTO
    }),
  );

  // ── CORS para Power Apps / Power Automate
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
  });

  // ── Swagger UI → http://localhost:3000/docs
  const config = new DocumentBuilder()
    .setTitle('Tickets API')
    .setDescription('Sistema de gestión de tickets — Backend NestJS')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀  API corriendo en: http://localhost:${port}/api/v1`);
  console.log(`📄  Swagger UI en:   http://localhost:${port}/docs\n`);
}
bootstrap();
