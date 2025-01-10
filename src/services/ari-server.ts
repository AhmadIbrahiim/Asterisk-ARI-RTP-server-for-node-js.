import { AriClient } from "@ipcom/asterisk-ari";
import { EventEmitter } from "events";
import { AriConfig } from "../interfaces/ari.interface";
import axios from "axios";

export class AriServer extends EventEmitter {
  private client: AriClient;
  private isConnected: boolean = false;
  private bridge?: any;
  private baseUrl: string;
  private auth: { username: string; password: string };

  constructor(private config: AriConfig) {
    super();
    this.client = new AriClient({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      secure: config.secure
    });
    this.baseUrl = `http://${config.host}:${config.port}/ari`;
    this.auth = {
      username: config.username,
      password: config.password
    };
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connectWebSocket([this.config.appName]);
      this.isConnected = true;
      console.log("Connected to Asterisk ARI");

      console.log("Creating mixing bridge...");
      this.bridge = await this.client.bridges.createBridge({ type: "mixing" });
      console.log("Bridge created:", this.bridge.id);

      this.setupEventHandlers();
    } catch (error) {
      console.error("Failed to connect to Asterisk ARI:", error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    this.client.on("StasisStart", async (event: any) => {
      const channelId = event.channel.id;
      console.log("Channel entered Stasis:", {
        id: channelId,
        name: event.channel.name,
      });

      try {
        await this.addChannelToBridge(channelId);
        this.emit("StasisStart", event);
      } catch (error) {
        console.error("Error handling StasisStart:", error);
      }
    });

    this.client.on("StasisEnd", (event: any) => {
      console.log("Channel left Stasis:", event.channel.id);
      this.emit("StasisEnd", event);
    });

    this.client.on("BridgeDestroyed", (event: any) => {
      console.log("Bridge destroyed:", event.bridge.id);
      this.emit("BridgeDestroyed", event);
    });
  }

  public async createLocalChannel(endpoint: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error("ARI client is not connected");
    }

    try {
      const channel = await this.client.channels.originate({
        endpoint,
        app: this.config.appName,
        appArgs: "dialed",
        formats: ["slin16"]
      });
      console.log("Local channel created:", channel.id);
      return channel;
    } catch (error) {
      console.error("Failed to create local channel:", error);
      throw error;
    }
  }

  public async createExternalMediaChannel(rtpHost: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error("ARI client is not connected");
    }

    try {
      const channel = await this.client.channels.createExternalMedia({
        app: this.config.appName,
        external_host: rtpHost,
        format: "slin16",
        connection_type: "udp"
      });
      console.log("External media channel created:", channel.id);
      return channel;
    } catch (error) {
      console.error("Failed to create external media channel:", error);
      throw error;
    }
  }

  public async addChannelToBridge(channelId: string): Promise<void> {
    if (!this.bridge) {
      throw new Error("Bridge not created");
    }

    try {
      await this.client.bridges.addChannels(this.bridge.id, { channel: channelId });
      console.log(`Added channel ${channelId} to bridge ${this.bridge.id}`);
    } catch (error) {
      console.error(`Failed to add channel ${channelId} to bridge:`, error);
      throw error;
    }
  }

  public async answer(channelId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error("ARI client is not connected");
    }

    try {
      await axios.post(
        `${this.baseUrl}/channels/${channelId}/answer`,
        {},
        { auth: this.auth }
      );
      console.log(`Answered channel ${channelId}`);
    } catch (error) {
      console.error(`Failed to answer channel ${channelId}:`, error);
      throw error;
    }
  }

  public async hangup(channelId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error("ARI client is not connected");
    }

    try {
      await axios.delete(
        `${this.baseUrl}/channels/${channelId}`,
        { auth: this.auth }
      );
      console.log(`Hung up channel ${channelId}`);
    } catch (error) {
      console.error(`Failed to hangup channel ${channelId}:`, error);
      throw error;
    }
  }

  public async destroyBridge(): Promise<void> {
    if (this.bridge) {
      try {
        await this.client.bridges.destroy(this.bridge.id);
        console.log(`Destroyed bridge ${this.bridge.id}`);
        this.bridge = undefined;
      } catch (error) {
        console.error("Failed to destroy bridge:", error);
        throw error;
      }
    }
  }

  public async cleanup(): Promise<void> {
    if (this.isConnected) {
      try {
        if (this.bridge) {
          await this.destroyBridge();
        }
        // Note: The client doesn't have a close method, but the WebSocket connection
        // will be closed when the process exits
        this.isConnected = false;
        console.log("Disconnected from Asterisk ARI");
      } catch (error) {
        console.error("Error during cleanup:", error);
        throw error;
      }
    }
  }

  public getClient(): AriClient {
    return this.client;
  }

  public getBridgeId(): string | undefined {
    return this.bridge?.id;
  }
}
