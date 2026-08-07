import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  isAllowedCorsOrigin,
  parseWebOrigins
} from "./common/cors-origins";
import { AppModule } from "./app.module";
import { assertServiceRoutesConfigured } from "./proxy/service-routes";

async function bootstrap(): Promise<void> {
  // A missing or misspelled service URL is otherwise only discovered one
  // request at a time, as a 503 on whichever routes use it — which reads like
  // an intermittent outage rather than a configuration error.
  assertServiceRoutesConfigured();

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
