import { randomUUID } from 'node:crypto';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import {
  getApiHttpSecuritySettings,
  isOriginAllowed,
  isSwaggerEnabled,
} from './http-security.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const httpSecuritySettings = getApiHttpSecuritySettings();
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.set('trust proxy', true);

  app.use((request, response, next) => {
    const requestIdHeader = request.header('x-request-id');
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
        ? requestIdHeader.trim()
        : randomUUID();

    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use(json({ limit: httpSecuritySettings.bodySizeLimit }));
  app.use(
    urlencoded({
      extended: true,
      limit: httpSecuritySettings.bodySizeLimit,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  app.enableCors({
    origin(origin, callback) {
      if (isOriginAllowed(origin, httpSecuritySettings.cors)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'), false);
    },
    methods: httpSecuritySettings.cors.allowedMethods,
    allowedHeaders: httpSecuritySettings.cors.allowedHeaders,
    exposedHeaders: httpSecuritySettings.cors.exposedHeaders,
    maxAge: httpSecuritySettings.cors.maxAgeSeconds,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  if (isSwaggerEnabled()) {
    const config = new DocumentBuilder()
      .setTitle('AI Legal Doc Validation API')
      .setDescription('TypeScript migration scaffold for the onboarding API')
      .setVersion('0.1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Google OIDC identity token or configured static bearer token.',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
}

bootstrap();
