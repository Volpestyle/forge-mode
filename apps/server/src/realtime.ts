import { WebSocket } from "ws";
import { RealtimeEvent } from "@forge/shared";

export class RealtimeHub {
  private clients = new Set<WebSocket>();

  addClient(socket: WebSocket) {
    this.clients.add(socket);
    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  broadcast(event: RealtimeEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
