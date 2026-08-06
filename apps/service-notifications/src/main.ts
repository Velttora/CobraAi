import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { assertSimulationNotInProduction } from "./adapters/simulation.guard";
import { assertEncryptionKeyConfigured } from "./integrations/encryption-key.guard";

async function bootstrap(): Promise<void> {
  // Boot-time assertion (D-17), not a per-call check: a per-call check would let
  // the process start and only fail once a debtor was already miscounted as
  // contacted. Failing here means a misconfigured production deploy never sends
  // a single phantom message.
  assertSimulationNotInProduction();

  // Same reasoning for the encryption key: without it the service boots fine and
  // every credential save fails at the moment a tenant presses Guardar, reading
  // to them as a network problem rather than missing configuration.
  assertEncryptionKeyConfigured();

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const port = Number(process.env.PORT ?? 3003);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
  Logger.log(
    `service-notifications en http://localhost:${port}/api/v1`,
    "Bootstrap"
  );
}

void bootstrap();
