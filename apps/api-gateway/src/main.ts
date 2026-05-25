import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  isAllowedCorsOrigin,
  parseWebOrigins
} from "./common/cors-origins";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true
  });

  const allowedOrigins = parseWebOrigins(process.env.WEB_ORIGIN);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || isAllowedCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);

  Logger.log(
    `CobraAI API Gateway en http://localhost:${port} (Clerk auth)`,
    "Bootstrap"
  );
}

void bootstrap();
