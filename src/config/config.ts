import { AriConfig } from '../interfaces/ari.interface';

export interface AppConfig {
  server: {
    host: string;
    swap16: boolean;
    audioOutputPath?: string;
  };
  wav: {
    sampleRate: number;
    numChannels: number;
    bitsPerSample: number;
  };
  ari: AriConfig;
}

export const defaultConfig: AppConfig = {
  server: {
    host: "127.0.0.1:8085",
    swap16: true,
  },
  wav: {
    sampleRate: 16000,
    numChannels: 1,
    bitsPerSample: 16,
  },
  ari: {
    host: "192.168.68.142",
    port: 8088,
    username: "admin",
    password: "admin",
    secure: false,
    appName: "hello-world"
  }
};
