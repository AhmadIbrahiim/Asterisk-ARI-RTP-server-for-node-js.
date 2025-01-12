import { RtpUdpServer } from "./services/rtp-server"
import { RtpPlayer } from "./services/rtp-player"
import { AriServer } from "./services/ari-server"
import { defaultConfig } from "./config/config"
import type { AppConfig } from "./config/config"
import { networkInterfaces } from "os"

export class RtpApplication {
  private server: RtpUdpServer
  private ariServer: AriServer
  private localChannel?: any
  private externalChannel?: any
  private backgroundPlayer?: RtpPlayer

  constructor(private config: AppConfig = defaultConfig) {
    // Get local IP for RTP server
    const localIP = this.getLocalIP()
    this.config.server.host = `${localIP}:8085`
    console.log(`Using local IP address: ${localIP}`)

    // Initialize RTP server
    this.server = new RtpUdpServer(this.config.server.host, this.config.server.swap16, this.config.server.audioOutputPath)

    // Initialize ARI server
    this.ariServer = new AriServer(this.config.ari)

    this.setupEventListeners()
  }

  private getLocalIP(): string {
    const interfaces = networkInterfaces()
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue
      for (const entry of iface) {
        if (entry.family === "IPv4" && !entry.internal && entry.address !== "127.0.0.1") {
          return entry.address
        }
      }
    }
    return "127.0.0.1"
  }

  private setupEventListeners(): void {
    // RTP Server events
    this.server.on("error", (error) => {
      console.error("RTP Server error:", error)
    })

    this.server.on("listening", (address) => {
      console.log("RTP Server is listening on:", address)
    })

    this.server.on("data", (data) => {
      console.log("Received RTP data of size:", data.length)
    })

    this.server.on("close", () => {
      console.log("RTP Server closed")
    })

    // ARI Server events
    this.ariServer.on("StasisStart", async (event) => {
      const channelId = event.channel.id
      console.log(`Channel entered Stasis: ${channelId}`)

      try {
        // If it's the local channel, answer it
        if (channelId === this.localChannel?.id) {
          await this.ariServer.answer(channelId)
        }
      } catch (error) {
        console.error("Error handling StasisStart:", error)
        await this.cleanup()
      }
    })

    this.ariServer.on("StasisEnd", async (event) => {
      console.log(`Channel left Stasis: ${event.channel.id}`)
      // await this.cleanup()
    })

    this.ariServer.on("BridgeDestroyed", () => {
      console.log("Bridge destroyed")
      this.server.close()
    })

    // Handle process termination
    process.on("SIGINT", () => this.cleanup())
    process.on("SIGTERM", () => this.cleanup())
  }

  public async start(): Promise<void> {
    try {
      // Connect to ARI
      await this.ariServer.connect()

      // Create channels
      this.localChannel = await this.ariServer.createLocalChannel("Local/1001@from-internal")
      this.externalChannel = await this.ariServer.createExternalMediaChannel(this.config.server.host)

      console.log("Application started successfully")
    } catch (error) {
      console.error("Failed to start application:", error)
      await this.cleanup()
      throw error
    }
  }

  private async cleanup(): Promise<void> {
    console.log("\nCleaning up...")

    // Stop background audio if playing
    this.stopBackgroundAudio()

    // Hangup channels if they exist
    if (this.localChannel) {
      await this.ariServer.hangup(this.localChannel.id).catch(console.error)
    }
    if (this.externalChannel) {
      await this.ariServer.hangup(this.externalChannel.id).catch(console.error)
    }

    // Cleanup servers
    this.server.close()
    await this.ariServer.cleanup()

    // process.exit(0)
  }

  public async playFile(filePath: string): Promise<void> {
    const [host, port] = this.config.server.host.split(":")
    const player = new RtpPlayer(host, parseInt(port))
    return player.playWavFile(filePath)
  }

  public static async convertToWav(inputFile: string, outputFile: string): Promise<string> {
    return RtpPlayer.convertToWav(inputFile, outputFile)
  }

  public async playBackgroundAudio(filePath: string): Promise<void> {
    const [host, port] = this.config.server.host.split(":")

    // Stop any existing background playback
    if (this.backgroundPlayer) {
      this.backgroundPlayer = undefined
    }

    // Create new player for background audio
    this.backgroundPlayer = new RtpPlayer(host, parseInt(port))

    try {
      // Play the file in a non-blocking way
      this.backgroundPlayer.playWavFile(filePath).catch(error => {
        console.error("Error playing background audio:", error)
      })
      console.log(`Started playing background audio: ${filePath}`)
    } catch (error) {
      console.error("Failed to start background audio:", error)
      throw error
    }
  }

  public stopBackgroundAudio(): void {
    if (this.backgroundPlayer) {
      this.backgroundPlayer = undefined
      console.log("Stopped background audio playback")
    }
  }
}

// Example usage:
if (require.main === module) {
  const app = new RtpApplication({
    ...defaultConfig,
    server: {
      ...defaultConfig.server,
      audioOutputPath: "output.wav",
    },
  })

  app.start().catch((error) => {
    console.error("Application failed to start:", error)
    process.exit(1)
  })

  // Handle any unhandled promise rejections
  process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error)
    process.exit(1)
  })
}
