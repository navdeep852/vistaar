import { NetworkStatus } from './types';
import { getPlatformInfo } from './platformDetection';

export interface NetworkService {
  getStatus(): Promise<NetworkStatus>;
  isOnline(): boolean;
  subscribe(callback: (status: NetworkStatus) => void): () => void;
}

class UniversalNetworkService implements NetworkService {
  private listeners: Set<(status: NetworkStatus) => void> = new Set();
  private currentStatus: NetworkStatus = {
    connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown',
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      this.initNativeListener();
    }
  }

  private async initNativeListener() {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Network) {
      try {
        const netPlugin = win.Capacitor.Plugins.Network;
        const status = await netPlugin.getStatus();
        this.currentStatus = {
          connected: Boolean(status.connected),
          connectionType: status.connectionType || 'unknown',
        };
        netPlugin.addListener('networkStatusChange', (s: any) => {
          this.currentStatus = {
            connected: Boolean(s.connected),
            connectionType: s.connectionType || 'unknown',
          };
          this.notifyListeners();
        });
      } catch (err) {
        console.warn('[NetworkService] Failed to initialize native network listener:', err);
      }
    }
  }

  private handleNetworkChange(connected: boolean) {
    this.currentStatus = {
      connected,
      connectionType: connected ? 'unknown' : 'none',
    };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentStatus);
      } catch (e) {
        console.error('[NetworkService] Error in network status listener:', e);
      }
    });
  }

  public async getStatus(): Promise<NetworkStatus> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Network) {
      try {
        const status = await win.Capacitor.Plugins.Network.getStatus();
        this.currentStatus = {
          connected: Boolean(status.connected),
          connectionType: status.connectionType || 'unknown',
        };
        return this.currentStatus;
      } catch (err) {
        console.warn('[NetworkService] Native network getStatus failed:', err);
      }
    }

    if (typeof navigator !== 'undefined') {
      this.currentStatus = {
        connected: navigator.onLine,
        connectionType: navigator.onLine ? 'unknown' : 'none',
      };
    }

    return this.currentStatus;
  }

  public isOnline(): boolean {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return this.currentStatus.connected;
  }

  public subscribe(callback: (status: NetworkStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentStatus);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const networkService: NetworkService = new UniversalNetworkService();
