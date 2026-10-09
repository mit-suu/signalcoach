import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

export async function connectDb(): Promise<void> {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ db: env.MONGODB_DB_NAME }, "MongoDB connected");
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbState(): "connected" | "connecting" | "disconnected" {
  const state = mongoose.connection.readyState;
  if (state === mongoose.ConnectionStates.connected) return "connected";
  if (state === mongoose.ConnectionStates.connecting) return "connecting";
  return "disconnected";
}
