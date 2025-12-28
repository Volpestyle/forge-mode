import { nanoid } from "nanoid";
import { WebSocket } from "ws";
import { EntityState, SessionServerMessage } from "@forge/shared";

type Client = {
  id: string;
  socket: WebSocket;
  roomId: string;
};

type Room = {
  id: string;
  entities: Map<string, EntityState>;
  clients: Set<Client>;
};

export class SessionManager {
  private rooms = new Map<string, Room>();

  join(roomId: string, socket: WebSocket, clientId?: string) {
    const room = this.getOrCreateRoom(roomId);
    const id = clientId ?? `client_${nanoid(6)}`;
    const client: Client = { id, socket, roomId };
    room.clients.add(client);

    socket.on("close", () => {
      this.leave(client);
    });

    this.ensurePlayerEntity(room, id);

    const welcome: SessionServerMessage = {
      type: "welcome",
      roomId,
      clientId: id,
      entities: Array.from(room.entities.values())
    };
    socket.send(JSON.stringify(welcome));

    return client;
  }

  spawnEntity(roomId: string, entity: EntityState) {
    const room = this.getOrCreateRoom(roomId);
    if (room.entities.has(entity.entityId)) {
      return;
    }
    room.entities.set(entity.entityId, entity);
    this.broadcast(room, { type: "entity_spawned", roomId, entity });
  }

  updateEntity(roomId: string, entityId: string, update: Partial<EntityState>) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const entity = room.entities.get(entityId);
    if (!entity) {
      return;
    }
    const next: EntityState = {
      ...entity,
      ...update,
      transform: update.transform ? { ...entity.transform, ...update.transform } : entity.transform,
      physics: update.physics ? { ...entity.physics, ...update.physics } : entity.physics
    };
    room.entities.set(entityId, next);
    this.broadcast(room, { type: "entity_updated", roomId, entity: next });
  }

  getEntity(roomId: string, entityId: string) {
    const room = this.rooms.get(roomId);
    return room?.entities.get(entityId) ?? null;
  }

  removeEntity(roomId: string, entityId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.entities.delete(entityId);
    this.broadcast(room, { type: "entity_removed", roomId, entityId });
  }

  updateEntityAsset(roomId: string, entityId: string, assetId: string) {
    this.updateEntity(roomId, entityId, { assetId });
  }

  private leave(client: Client) {
    const room = this.rooms.get(client.roomId);
    if (!room) {
      return;
    }
    room.clients.delete(client);
    this.removeEntity(client.roomId, `player_${client.id}`);
    if (room.clients.size === 0) {
      this.rooms.delete(room.id);
    }
  }

  private ensurePlayerEntity(room: Room, clientId: string) {
    const playerId = `player_${clientId}`;
    if (room.entities.has(playerId)) {
      return;
    }
    const entity: EntityState = {
      entityId: playerId,
      assetId: "player_proxy",
      ownerId: clientId,
      transform: {
        position: { x: 0, y: 1.6, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.8, y: 1.8, z: 0.8 }
      },
      physics: { mass: 90, friction: 4, restitution: 0.1 }
    };
    room.entities.set(playerId, entity);
    this.broadcast(room, { type: "entity_spawned", roomId: room.id, entity });
  }

  private getOrCreateRoom(roomId: string) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, entities: new Map(), clients: new Set() };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private broadcast(room: Room, message: SessionServerMessage) {
    const payload = JSON.stringify(message);
    for (const client of room.clients) {
      if (client.socket.readyState === client.socket.OPEN) {
        client.socket.send(payload);
      }
    }
  }
}
