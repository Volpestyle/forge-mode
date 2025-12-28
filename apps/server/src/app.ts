import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { config } from "./config";
import { MemoryStore } from "./store/memoryStore";
import { GenerationOrchestrator } from "./generation/orchestrator";
import { RealtimeHub } from "./realtime";
import { registerJobRoutes } from "./routes/jobs";
import { registerAssetRoutes } from "./routes/assets";
import { createStorage } from "./storage";

export const buildApp = () => {
  const server = Fastify({ logger: true });
  const realtime = new RealtimeHub();
  const store = new MemoryStore();
  const storage = createStorage(config.publicBaseUrl);
  const orchestrator = new GenerationOrchestrator(store, realtime, storage);

  server.register(cors, { origin: true });
  server.register(websocket);
  server.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "storage"),
    prefix: "/storage/"
  });

  server.get(config.wsPath, { websocket: true }, (connection) => {
    realtime.addClient(connection.socket);
  });

  server.get("/health", async () => ({ ok: true }));

  registerJobRoutes(server, store, orchestrator);
  registerAssetRoutes(server, store);

  return server;
};
