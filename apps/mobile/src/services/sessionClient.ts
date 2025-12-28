import { EntityState, SessionClientMessage, SessionServerMessage } from "@forge/shared";

export class SessionClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: SessionServerMessage) => void>();
  private wsUrl: string;

  constructor(baseUrl: string) {
    const wsBase = baseUrl.replace(/^http/, "ws");
    this.wsUrl = `${wsBase}/session`;
  }

  connect(roomId: string, clientId?: string) {
    this.socket = new WebSocket(this.wsUrl);
    this.socket.onopen = () => {
      const join: SessionClientMessage = { type: "join", roomId, clientId };
      this.socket?.send(JSON.stringify(join));
    };
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as SessionServerMessage;
        this.listeners.forEach((listener) => listener(message));
      } catch (error) {
        void error;
      }
    };
    this.socket.onclose = () => {
      this.socket = null;
      setTimeout(() => this.connect(roomId, clientId), 1000);
    };
  }

  onMessage(handler: (event: SessionServerMessage) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  spawnEntity(roomId: string, entity: EntityState) {
    this.send({ type: "spawn_entity", roomId, entity });
  }

  updateEntity(roomId: string, entityId: string, update: Partial<EntityState>) {
    this.send({
      type: "update_entity",
      roomId,
      entityId,
      assetId: update.assetId,
      transform: update.transform,
      physics: update.physics
    });
  }

  removeEntity(roomId: string, entityId: string) {
    this.send({ type: "remove_entity", roomId, entityId });
  }

  private send(message: SessionClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
