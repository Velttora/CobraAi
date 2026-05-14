import process from "node:process";

const queueNames = ["imports", "outreach", "voice-calls"] as const;

async function bootstrap() {
  // Week 0 keeps the worker minimal; Week 1 wires pg-boss handlers here.
  console.log("Renova worker ready", {
    queues: queueNames,
    cache: "disabled",
    redis: "disabled"
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});
