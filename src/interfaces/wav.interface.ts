export interface WavOptions {
  sampleRate?: number
  numChannels?: number
  bitsPerSample?: number
}

export interface RtpPacketHeader {
  version: number
  padding: boolean
  extension: boolean
  csrcCount: number
  payloadType: number
  sequenceNumber: number
  timestamp: number
  ssrc: number
}
