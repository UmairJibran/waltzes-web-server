import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';
import * as path from 'path';
import 'winston-daily-rotate-file';

async function bootstrap() {
  const transports = [
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        winston.format.json(),
        nestWinstonModuleUtilities.format.nestLike('Waltzes - APP', {
          colors: true,
          prettyPrint: true,
          processId: true,
          appName: true,
        }),
      ),
    }),
    new winston.transports.File({
      dirname: path.join(__dirname, './../logs/'),
    }),
  ];
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: transports,
    }),
  });
  app.use(helmet());
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
