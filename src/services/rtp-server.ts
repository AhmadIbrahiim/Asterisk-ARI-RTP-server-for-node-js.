import dgram from "dgram"
import * as fs from "fs"
import { WavHeader } from "../utils/wav-header"
import { RtpPacketHeader } from "../interfaces/wav.interface"
import { EventEmitter } from "events"

export class RtpUdpServer extends EventEmitter {
  private server: dgram.Socket
  private fileStream?: fs.WriteStream
  private packetCount: number = 0
  private dataSize: number = 0
  private headerBuffer?: Buffer
  private isRunning: boolean = false

  constructor(private host: string, private swap16: boolean = false, private audioOutputPath?: string) {
    super()
    this.server = dgram.createSocket("udp4")
    this.setupServer()
    this.initializeFileStream()
  }

  private initializeFileStream(): void {
    if (this.audioOutputPath) {
      this.audioOutputPath = this.audioOutputPath.endsWith(".wav") ? this.audioOutputPath : `${this.audioOutputPath}.wav`
      this.fileStream = fs.createWriteStream(this.audioOutputPath)
      this.headerBuffer = WavHeader.create()
      this.fileStream.write(this.headerBuffer)
    }
  }

  private setupServer(): void {
    const [address, port] = this.host.split(":")

    this.server.on("error", (err) => {
      console.error(`Server error:\n${err.stack}`)
      this.emit("error", err)
      this.close()
    })

    this.server.on("message", this.handleMessage.bind(this))

    this.server.on("listening", () => {
      const address = this.server.address()
      console.log("RTP server listening details:", {
        address: address.address,
        port: address.port,
        family: address.family,
      })
      this.emit("listening", address)
    })

    this.server.bind(parseInt(port), address)
    this.isRunning = true
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    console.log(`Received UDP packet from ${rinfo.address}:${rinfo.port}`, {
      size: msg.length,
      firstBytes: msg.slice(0, 4),
    })

    this.packetCount++
    const header = this.parseRtpHeader(msg)
    this.logRtpHeader(header)

    // Strip the 12 byte RTP header
    let buf = msg.slice(12)
    if (this.swap16) {
      buf.swap16()
      console.log("Performed 16-bit byte swap on audio data")
    }

    if (this.fileStream && this.headerBuffer) {
      this.fileStream.write(buf)
      this.dataSize += buf.length
      console.log(`Wrote ${buf.length} bytes to WAV file`)
    }

    this.emit("data", buf)
  }

  private parseRtpHeader(msg: Buffer): RtpPacketHeader {
    return {
      version: (msg[0] >> 6) & 0x03,
      padding: ((msg[0] >> 5) & 0x01) === 1,
      extension: ((msg[0] >> 4) & 0x01) === 1,
      csrcCount: msg[0] & 0x0f,
      payloadType: msg[1] & 0x7f,
      sequenceNumber: msg.readUInt16BE(2),
      timestamp: msg.readUInt32BE(4),
      ssrc: msg.readUInt32BE(8),
    }
  }

  private logRtpHeader(header: RtpPacketHeader): void {
    console.log(`
      RTP Packet #${this.packetCount}
      Version: ${header.version}
      Padding: ${header.padding}
      Extension: ${header.extension}
      CSRC Count: ${header.csrcCount}
      Payload Type: ${header.payloadType}
      Sequence Number: ${header.sequenceNumber}
      Timestamp: ${header.timestamp}
      SSRC: ${header.ssrc}
    `)
  }

  public close(): void {
    if (!this.isRunning) return

    if (this.fileStream && this.headerBuffer) {
      WavHeader.updateSizes(this.headerBuffer, this.dataSize)

      // Seek to beginning and rewrite header with correct sizes
      const fd = fs.openSync(this.audioOutputPath!, "r+")
      fs.writeSync(fd, this.headerBuffer, 0, 44, 0)
      fs.closeSync(fd)

      this.fileStream.end()
    }

    this.server.close()
    this.isRunning = false
    this.emit("close")
  }

  public getServer(): dgram.Socket {
    return this.server
  }
}
