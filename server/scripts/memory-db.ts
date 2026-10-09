/**
 * Throwaway MongoDB for local dev when Docker isn't running. Data is lost on exit.
 *   npm run db:memory   → then keep MONGODB_URI=mongodb://127.0.0.1:27017 in .env
 */
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const mongo = await MongoMemoryServer.create({ instance: { port: 27017, ip: "127.0.0.1" } });
  console.log(`In-memory MongoDB ready at ${mongo.getUri()} (Ctrl+C to stop)`);
  const stop = async () => {
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main();
