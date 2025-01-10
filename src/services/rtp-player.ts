import dgram from "dgram"
import * as fs from "fs"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export class RtpPlayer {
  private client: dgram.Socket
  private sequence: number = 0
  private timestamp: number = 0
  private ssrc: number = Math.floor(Math.random() * 0xffffffff)

  constructor(private destinationHost: string, private destinationPort: number) {
    this.client = dgram.createSocket("udp4")
  }

  private createRtpPacket(payload: Buffer): Buffer {
    const headerSize = 12
    const packet = Buffer.alloc(headerSize + payload.length)

    // RTP version 2, no padding, no extension, no CSRC
    packet[0] = 0x80
    // Payload type 0 (PCMU), no marker
    packet[1] = 0x00

    // Sequence number (16 bits)
    packet.writeUInt16BE(this.sequence++, 2)
    // Timestamp (32 bits)
    packet.writeUInt32BE(this.timestamp, 4)
    this.timestamp += payload.length / 2 // Increment by number of samples
    // SSRC (32 bits)
    packet.writeUInt32BE(this.ssrc, 8)

    // Copy payload
    payload.copy(packet, headerSize)
    return packet
  }

  public async playWavFile(filePath: string, packetSize: number = 160): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const fileData = fs.readFileSync(filePath)
        let offset = 44 // Skip WAV header

        const sendNextPacket = () => {
          if (offset >= fileData.length) {
            this.client.close()
            resolve()
            return
          }

          const remainingBytes = fileData.length - offset
          const currentPacketSize = Math.min(packetSize, remainingBytes)
          const payload = fileData.slice(offset, offset + currentPacketSize)

          const rtpPacket = this.createRtpPacket(payload)
          this.client.send(rtpPacket, this.destinationPort, this.destinationHost, (err) => {
            if (err) {
              this.client.close()
              reject(err)
              return
            }

            offset += currentPacketSize
            // Schedule next packet (assuming 8000Hz sample rate, 20ms packets)
            setTimeout(sendNextPacket, 20)
          })
        }

        sendNextPacket()
      } catch (error) {
        reject(error)
      }
    })
  }

  public static async convertToWav(inputFile: string, outputFile: string): Promise<string> {
    // Ensure output has .wav extension
    const outputPath = outputFile.endsWith(".wav") ? outputFile : `${outputFile}.wav`

    try {
      // Convert to 16-bit PCM WAV, 16kHz, mono
      await execAsync(`ffmpeg -i "${inputFile}" -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`)
      return outputPath
    } catch (error) {
      console.error("Error converting file:", error)
      throw error
    }
  }
}
