import { FastifyInstance } from "fastify";
import { SessionClientMessage } from "@forge/shared";
import { SessionManager } from "./sessionManager";

export const registerSessionRoutes = (server: FastifyInstance, sessions: SessionManager) => {
  server.get("/session", { websocket: true }, (connection) => {
    let clientId: string | null = null;
    let roomId: string | null = null;

    connection.socket.on("message", (raw) => {
      let message: SessionClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === "join") {
        roomId = message.roomId;
        const client = sessions.join(message.roomId, connection.socket, message.clientId);
        clientId = client.id;
        return;
      }

      if (!roomId || !clientId) {
        return;
      }

      if (message.type === "spawn_entity") {
        const entity = message.entity;
        if (!entity.ownerId) {
          entity.ownerId = clientId;
        }
        if (entity.ownerId !== clientId) {
          return;
        }
        sessions.spawnEntity(roomId, entity);
        return;
      }

      if (message.type === "update_entity") {
        const current = sessions.getEntity(roomId, message.entityId);
        if (current?.ownerId && current.ownerId !== clientId) {
          return;
        }
        sessions.updateEntity(roomId, message.entityId, {
          assetId: message.assetId ?? current?.assetId,
          transform: message.transform ? { ...current?.transform, ...message.transform } : current?.transform,
          physics: message.physics ? { ...current?.physics, ...message.physics } : current?.physics
        });
        return;
      }

      if (message.type === "remove_entity") {
        const current = sessions.getEntity(roomId, message.entityId);
        if (current?.ownerId && current.ownerId !== clientId) {
          return;
        }
        sessions.removeEntity(roomId, message.entityId);
      }
    });
  });
};
