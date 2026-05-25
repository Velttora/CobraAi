import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const port = Number(process.env.PORT ?? 3002);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
  Logger.log(
    `service-workflows en http://localhost:${port}/api/v1`,
    "Bootstrap"
  );
}

void bootstrap();
