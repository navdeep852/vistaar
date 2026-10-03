export type PlatformType = 'web' | 'android' | 'ios' | 'desktop';

export interface PlatformInfo {
  platform: PlatformType;
  isWeb: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isDesktop: boolean;
  isNativeMobile: boolean;
  hasTouch: boolean;
}

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
  files?: File[];
  recipientPhone?: string;
}

export interface FileSaveOptions {
  fileName: string;
  data: Blob | string | Uint8Array;
  mimeType?: string;
}

export interface FilePickOptions {
  accept?: string;
  multiple?: boolean;
}

export interface CapturedImage {
  dataUrl?: string;
  blob?: Blob;
  format?: string;
}

export interface CameraOptions {
  quality?: number; // 0 - 100
  source?: 'camera' | 'photos';
  allowEditing?: boolean;
}

export interface NetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
}

export interface LocalNotificationOptions {
  id?: number;
  title: string;
  body: string;
  scheduleDate?: Date;
  actionTypeId?: string;
  extra?: Record<string, any>;
}
