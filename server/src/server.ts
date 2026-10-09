import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDb, disconnectDb } from "./config/db";
import { loadContent } from "./services/content.service";
import { createApp } from "./app";

async function main() {
  const counts = loadContent();
  logger.info(counts, "Content loaded");

  await connectDb();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, llm: env.LLM_PROVIDER }, "API listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});
