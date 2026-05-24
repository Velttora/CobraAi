#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const services = [
  { dir: "api-gateway", name: "@cobrai/api-gateway", service: "api-gateway", port: 3000 },
  {
    dir: "service-portfolios",
    name: "@cobrai/service-portfolios",
    service: "service-portfolios",
    port: 3001
  },
  {
    dir: "service-workflows",
    name: "@cobrai/service-workflows",
    service: "service-workflows",
    port: 3002
  },
  {
    dir: "service-notifications",
    name: "@cobrai/service-notifications",
    service: "service-notifications",
    port: 3003
  },
  {
    dir: "service-payments",
    name: "@cobrai/service-payments",
    service: "service-payments",
    port: 3004
  }
];

const root = new URL("../apps/", import.meta.url).pathname;

for (const svc of services) {
  const base = join(root, svc.dir, "src");
  mkdirSync(join(base, "health"), { recursive: true });

  writeFileSync(
    join(root, svc.dir, "package.json"),
    JSON.stringify(
      {
        name: svc.name,
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "nest start --watch",
          build: "nest build",
          start: "node dist/main.js",
          lint: `eslint "src/**/*.ts"`,
          typecheck: "tsc --noEmit -p tsconfig.json",
          test: "vitest run --passWithNoTests"
        },
        dependencies: {
          "@nestjs/common": "^10.4.22",
          "@nestjs/core": "^10.4.22",
          "@nestjs/platform-express": "^10.4.22",
          "reflect-metadata": "^0.2.2",
          rxjs: "^7.8.2"
        },
        devDependencies: {
          "@nestjs/cli": "^10.4.9",
          "@nestjs/schematics": "^10.2.3",
          "@nestjs/testing": "^10.4.22"
        }
      },
      null,
      2
    )
  );

  writeFileSync(
    join(root, svc.dir, "nest-cli.json"),
    JSON.stringify(
      {
        $schema: "https://json.schemastore.org/nest-cli",
        collection: "@nestjs/schematics",
        sourceRoot: "src",
        compilerOptions: { deleteOutDir: true }
      },
      null,
      2
    )
  );

  writeFileSync(
    join(root, svc.dir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: "../../tsconfig.base.json",
        compilerOptions: {
          outDir: "dist",
          rootDir: "src",
          module: "CommonJS",
          moduleResolution: "Node",
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          types: ["node"]
        },
        include: ["src/**/*.ts"],
        exclude: ["node_modules", "dist"]
      },
      null,
      2
    )
  );

  writeFileSync(
    join(root, svc.dir, "tsconfig.build.json"),
    JSON.stringify(
      {
        extends: "./tsconfig.json",
        exclude: ["node_modules", "dist", "**/*.spec.ts"]
      },
      null,
      2
    )
  );

  writeFileSync(
    join(base, "main.ts"),
    `import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const port = Number(process.env.PORT ?? ${svc.port});
  await app.listen(port);
  Logger.log(\`${svc.service} listening on http://localhost:\${port}/api\`, "Bootstrap");
}

void bootstrap();
`
  );

  writeFileSync(
    join(base, "app.module.ts"),
    `import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [HealthModule]
})
export class AppModule {}
`
  );

  writeFileSync(
    join(base, "health/health.module.ts"),
    `import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController]
})
export class HealthModule {}
`
  );

  writeFileSync(
    join(base, "health/health.controller.ts"),
    `import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): { ok: boolean; service: string } {
    return { ok: true, service: "${svc.service}" };
  }
}
`
  );
}

console.log("Scaffolded CobraAI Nest services.");
