import { AssetResponse, JobCreateRequest, JobCreateResponse, JobStatusResponse, RealtimeEvent } from "@forge/shared";

export class ApiClient {
  private baseUrl: string;
  private wsUrl: string;
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: RealtimeEvent) => void>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const wsBase = this.baseUrl.replace(/^http/, "ws");
    this.wsUrl = `${wsBase}/ws`;
  }

  async createJob(payload: JobCreateRequest) {
    const response = await fetch(`${this.baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Job create failed: ${response.status}`);
    }
    return (await response.json()) as JobCreateResponse;
  }

  async getJob(jobId: string) {
    const response = await fetch(`${this.baseUrl}/v1/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Job fetch failed: ${response.status}`);
    }
    return (await response.json()) as JobStatusResponse;
  }

  async getAsset(assetId: string) {
    const response = await fetch(`${this.baseUrl}/v1/assets/${assetId}`);
    if (!response.ok) {
      throw new Error(`Asset fetch failed: ${response.status}`);
    }
    return (await response.json()) as AssetResponse;
  }

  connectRealtime() {
    if (this.socket) {
      return;
    }
    this.socket = new WebSocket(this.wsUrl);
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as RealtimeEvent;
        this.listeners.forEach((listener) => listener(data));
      } catch (error) {
        void error;
      }
    };
    this.socket.onclose = () => {
      this.socket = null;
      setTimeout(() => this.connectRealtime(), 1000);
    };
  }

  onEvent(handler: (event: RealtimeEvent) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }
}
