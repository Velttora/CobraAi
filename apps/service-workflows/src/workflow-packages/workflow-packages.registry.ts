import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  WorkflowPackageDefinition,
  WorkflowPackageSummary
} from "./workflow-packages.types";

function definitionsDir(): string {
  const candidates = [
    join(__dirname, "definitions"),
    join(process.cwd(), "src/workflow-packages/definitions"),
    join(process.cwd(), "dist/workflow-packages/definitions")
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }

  return join(__dirname, "definitions");
}

function loadDefinitions(): WorkflowPackageDefinition[] {
  const dir = definitionsDir();
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const raw = readFileSync(join(dir, file), "utf8");
      return JSON.parse(raw) as WorkflowPackageDefinition;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

let cached: WorkflowPackageDefinition[] | null = null;

export function getWorkflowPackageDefinitions(): WorkflowPackageDefinition[] {
  cached ??= loadDefinitions();
  return cached;
}

export function getWorkflowPackageDefinition(
  id: string
): WorkflowPackageDefinition | undefined {
  return getWorkflowPackageDefinitions().find((pkg) => pkg.id === id);
}

export function toPackageSummary(
  pkg: WorkflowPackageDefinition
): WorkflowPackageSummary {
  const channels = [
    ...new Set(
      pkg.rules
        .map((rule) => rule.channel)
        .filter((channel): channel is string => Boolean(channel))
    )
  ];

  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    profile: pkg.profile,
    rules_count: pkg.rules.length,
    channels,
    has_voice_stub: channels.includes("voice")
  };
}

/** Permite recargar paquetes en tests sin reiniciar el proceso. */
export function resetWorkflowPackageCache(): void {
  cached = null;
}
