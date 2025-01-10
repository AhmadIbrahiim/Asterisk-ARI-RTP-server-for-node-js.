export interface AriConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  appName: string;
}

export interface AriEvents {
  onStasisStart: (event: any) => void;
  onStasisEnd: (event: any) => void;
  onChannelDtmfReceived: (event: any) => void;
  onChannelStateChange: (event: any) => void;
  onBridgeDestroyed: (event: any) => void;
}
