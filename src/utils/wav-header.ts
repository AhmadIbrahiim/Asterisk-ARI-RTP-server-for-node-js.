import { WavOptions } from "../interfaces/wav.interface"

export class WavHeader {
  private static writeString(buffer: Buffer, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      buffer.writeUInt8(str.charCodeAt(i), offset + i)
    }
  }

  public static create({ sampleRate = 16000, numChannels = 1, bitsPerSample = 16 }: WavOptions = {}): Buffer {
    const header = Buffer.alloc(44)

    // RIFF chunk descriptor
    this.writeString(header, 0, "RIFF")
    header.writeUInt32LE(0, 4) // ChunkSize (will be filled later)
    this.writeString(header, 8, "WAVE")

    // fmt sub-chunk
    this.writeString(header, 12, "fmt ")
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20) // PCM = 1
    header.writeUInt16LE(numChannels, 22)
    header.writeUInt32LE(sampleRate, 24)

    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    header.writeUInt32LE(byteRate, 28)

    const blockAlign = (numChannels * bitsPerSample) / 8
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)

    // data sub-chunk
    this.writeString(header, 36, "data")
    header.writeUInt32LE(0, 40) // Subchunk2Size (will be filled later)

    return header
  }

  public static updateSizes(header: Buffer, dataSize: number): void {
    header.writeUInt32LE(dataSize + 36, 4) // ChunkSize
    header.writeUInt32LE(dataSize, 40) // Subchunk2Size
  }
}
