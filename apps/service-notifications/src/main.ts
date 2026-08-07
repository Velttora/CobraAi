import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { assertSimulationNotInProduction } from "./adapters/simulation.guard";
import { checkEncryptionKey } from "./integrations/encryption-key.guard";

async function bootstrap(): Promise<void> {
  // Boot-time assertion (D-17), not a per-call check: a per-call check would let
  // the process start and only fail once a debtor was already miscounted as
  // contacted. Failing here means a misconfigured production deploy never sends
  // a single phantom message.
  assertSimulationNotInProduction();

  const app = await NestFactory.create(AppModule);

  // The encryption key is checked but NOT asserted: only credential storage
  // needs it, and aborting here would take WhatsApp, email, voice and the
  // inbound webhooks down over a feature-scoped configuration gap. The
  // integrations endpoints refuse with this same reason, so it stays
  // impossible to miss without being an outage.
  const encryptionKey = checkEncryptionKey();
  if (!encryptionKey.usable) {
    new Logger("Bootstrap").error(
      `Integraciones deshabilitadas: ${encryptionKey.reason}`
    );
  }
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
