/**
 * VISTAAR Business OS — Microsoft OneDrive Service
 * Secure integration with Microsoft Identity Platform & Microsoft Graph API
 * Uses OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636) for public clients.
 */

import { supabaseAuthService } from './supabaseAuth';
import { safeGetTenantStorage, safeSaveTenantStorage } from './supabase/safeStorage';
import { OneDriveConnection, OneDriveBackupItem } from '../types';

const ONEDRIVE_CONN_STORAGE_KEY = 'vistaar_onedrive_connection';
const PKCE_VERIFIER_KEY = 'vistaar_onedrive_pkce_verifier';
const OAUTH_STATE_KEY = 'vistaar_onedrive_oauth_state';

// Default Microsoft App Client ID for VISTAAR (or override via VITE_MICROSOFT_CLIENT_ID)
const DEFAULT_CLIENT_ID = '9b6d8f50-3bf0-4f54-b4a1-8d2a67bc4790'; // Registered SPA Client ID placeholder

export function getMicrosoftClientId(): string {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MICROSOFT_CLIENT_ID) {
    return (import.meta as any).env.VITE_MICROSOFT_CLIENT_ID;
  }
  return DEFAULT_CLIENT_ID;
}

export function getRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/settings`;
  }
  return 'http://localhost:3000/settings';
}

// Scopes: Files.ReadWrite.AppFolder (least-privilege AppFolder) + Files.ReadWrite (root folder fallback) + offline_access (refresh token) + User.Read
const SCOPES = ['Files.ReadWrite.AppFolder', 'Files.ReadWrite', 'offline_access', 'User.Read'].join(' ');

/**
 * Generate cryptographically secure PKCE Code Verifier
 */
function generateCodeVerifier(length = 64): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => possible[x % possible.length]).join('');
}

/**
 * Generate base64url-encoded SHA-256 Code Challenge from Verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
}

export class OneDriveService {
  private inMemoryTokens: StoredTokens | null = null;

  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId() || 'default_ws';
  }

  /**
   * Retrieves active connection info for current workspace
   */
  public getConnectionStatus(): OneDriveConnection {
    const list = safeGetTenantStorage<OneDriveConnection>(ONEDRIVE_CONN_STORAGE_KEY, []);
    if (list.length > 0) {
      return list[0];
    }
    return { isConnected: false };
  }

  /**
   * Saves updated connection status for current workspace
   */
  private saveConnectionStatus(conn: OneDriveConnection): void {
    safeSaveTenantStorage(ONEDRIVE_CONN_STORAGE_KEY, [conn]);
  }

  /**
   * Initiates Microsoft OAuth 2.0 PKCE Login
   */
  public async initiateLogin(): Promise<{ authUrl: string }> {
    const clientId = getMicrosoftClientId();
    const redirectUri = getRedirectUri();
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const wsId = this.getWorkspaceId();

    const stateObj = {
      workspaceId: wsId,
      nonce: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const stateStr = btoa(JSON.stringify(stateObj));

    // Store verifier and state in sessionStorage (ephemeral, not persisted across browser closes)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      sessionStorage.setItem(OAUTH_STATE_KEY, stateStr);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state: stateStr,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    return { authUrl };
  }

  /**
   * Handles incoming OAuth redirect code
   */
  public async handleAuthCallback(code: string, returnedState: string): Promise<{ success: boolean; error?: string }> {
    try {
      const storedState = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(OAUTH_STATE_KEY) : null;
      const verifier = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(PKCE_VERIFIER_KEY) : null;

      if (!verifier) {
        return { success: false, error: 'OAuth state verification failed: Missing PKCE code verifier.' };
      }

      if (storedState && storedState !== returnedState) {
        return { success: false, error: 'OAuth state mismatch: Possible cross-site request forgery attempt.' };
      }

      // Validate workspace association in state
      try {
        const decoded = JSON.parse(atob(returnedState));
        if (decoded.workspaceId && decoded.workspaceId !== this.getWorkspaceId()) {
          return { success: false, error: 'Tenant isolation violation: OAuth response was initiated by a different workspace.' };
        }
      } catch {
        // ignore state decode error
      }

      const clientId = getMicrosoftClientId();
      const redirectUri = getRedirectUri();

      // Exchange code for access & refresh tokens
      const tokenBody = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        return { success: false, error: errJson.error_description || errJson.error || 'Token exchange failed with Microsoft.' };
      }

      const tokenData = await tokenRes.json();
      const expiresInSec = tokenData.expires_in || 3600;

      this.inMemoryTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (expiresInSec - 300) * 1000, // 5 min margin
      };

      // Clean up sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
      }

      // Fetch user profile from Microsoft Graph
      const profile = await this.getGraphUserProfile(this.inMemoryTokens.accessToken);

      const conn: OneDriveConnection = {
        isConnected: true,
        userEmail: profile.userPrincipalName || profile.mail || 'Microsoft Account',
        displayName: profile.displayName || 'Authorized User',
        connectedAt: new Date().toISOString(),
        folderPath: 'OneDrive > Apps > VISTAAR',
      };

      this.saveConnectionStatus(conn);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Authentication exchange failed.' };
    }
  }

  /**
   * Fetches user profile info from Microsoft Graph
   */
  private async getGraphUserProfile(accessToken: string): Promise<any> {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return {};
  }

  /**
   * Ensures an active, valid access token is available, refreshing if necessary
   */
  public async getValidAccessToken(): Promise<string | null> {
    const now = Date.now();
    if (this.inMemoryTokens && this.inMemoryTokens.expiresAt > now) {
      return this.inMemoryTokens.accessToken;
    }

    // Attempt token refresh if refresh token is available
    if (this.inMemoryTokens?.refreshToken) {
      try {
        const clientId = getMicrosoftClientId();
        const body = new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: this.inMemoryTokens.refreshToken,
          scope: SCOPES,
        });

        const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (res.ok) {
          const data = await res.json();
          this.inMemoryTokens = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || this.inMemoryTokens.refreshToken,
            expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
          };
          return this.inMemoryTokens.accessToken;
        }
      } catch (e) {
        console.warn('[OneDrive] Token refresh error:', e);
      }
    }

    return null;
  }

  /**
   * Disconnects Microsoft OneDrive (retaining remote files)
   */
  public disconnect(): void {
    this.inMemoryTokens = null;
    this.saveConnectionStatus({ isConnected: false });
  }

  /**
   * Uploads a backup archive (Blob or ArrayBuffer) to Microsoft OneDrive.
   * Uses simple PUT for files < 4MB; uses Microsoft Graph UploadSession for files >= 4MB.
   */
  public async uploadBackupArchive(
    fileName: string,
    fileData: Blob | ArrayBuffer,
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; itemId?: string; webUrl?: string; error?: string }> {
    const token = await this.getValidAccessToken();
    if (!token) {
      return { success: false, error: 'Not connected to Microsoft OneDrive or session expired. Please connect your account.' };
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sizeBytes = fileData instanceof Blob ? fileData.size : fileData.byteLength;
    const isLarge = sizeBytes >= 4 * 1024 * 1024; // 4MB threshold

    try {
      // Preferred destination: Dedicated Application Folder (me/drive/special/approot)
      let targetPath = `/me/drive/special/approot:/${cleanFileName}`;

      if (!isLarge) {
        // Small file: Single PUT
        onProgress?.(25);
        const res = await fetch(`https://graph.microsoft.com/v1.0${targetPath}:/content`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: fileData,
        });

        if (res.ok) {
          const item = await res.json();
          onProgress?.(100);
          this.updateLastBackupTimestamp();
          return { success: true, itemId: item.id, webUrl: item.webUrl };
        } else if (res.status === 404) {
          // Fallback to standard root folder VISTAAR_Backups
          targetPath = `/me/drive/root:/VISTAAR_Backups/${cleanFileName}`;
          const resFallback = await fetch(`https://graph.microsoft.com/v1.0${targetPath}:/content`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/octet-stream',
            },
            body: fileData,
          });
          if (resFallback.ok) {
            const item = await resFallback.json();
            onProgress?.(100);
            this.updateLastBackupTimestamp();
            return { success: true, itemId: item.id, webUrl: item.webUrl };
          }
        }

        const errText = await res.text();
        return { success: false, error: `OneDrive upload failed (${res.status}): ${errText}` };
      } else {
        // Large file: Resumable Upload Session
        onProgress?.(10);
        let sessionRes = await fetch(`https://graph.microsoft.com/v1.0${targetPath}:/createUploadSession`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            item: {
              '@microsoft.graph.conflictBehavior': 'rename',
              name: cleanFileName,
            },
          }),
        });

        if (sessionRes.status === 404) {
          // Fallback to root folder
          targetPath = `/me/drive/root:/VISTAAR_Backups/${cleanFileName}`;
          sessionRes = await fetch(`https://graph.microsoft.com/v1.0${targetPath}:/createUploadSession`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              item: {
                '@microsoft.graph.conflictBehavior': 'rename',
                name: cleanFileName,
              },
            }),
          });
        }

        if (!sessionRes.ok) {
          const errText = await sessionRes.text();
          return { success: false, error: `Failed to create OneDrive upload session: ${errText}` };
        }

        const sessionData = await sessionRes.json();
        const uploadUrl = sessionData.uploadUrl;

        // Chunked upload: 5 MB chunks
        const CHUNK_SIZE = 5 * 1024 * 1024;
        let offset = 0;
        let buffer: ArrayBuffer;

        if (fileData instanceof Blob) {
          buffer = await fileData.arrayBuffer();
        } else {
          buffer = fileData;
        }

        let uploadedItem: any = null;

        while (offset < sizeBytes) {
          const chunkEnd = Math.min(offset + CHUNK_SIZE, sizeBytes);
          const chunk = buffer.slice(offset, chunkEnd);
          const contentLength = chunkEnd - offset;

          const chunkRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(contentLength),
              'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${sizeBytes}`,
            },
            body: chunk,
          });

          if (!chunkRes.ok) {
            const errChunk = await chunkRes.text();
            return { success: false, error: `Upload chunk failed (${offset}-${chunkEnd}): ${errChunk}` };
          }

          if (chunkRes.status === 201 || chunkRes.status === 200) {
            uploadedItem = await chunkRes.json();
          }

          offset = chunkEnd;
          const pct = Math.round((offset / sizeBytes) * 100);
          onProgress?.(pct);
        }

        this.updateLastBackupTimestamp();
        return {
          success: true,
          itemId: uploadedItem?.id,
          webUrl: uploadedItem?.webUrl,
        };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'OneDrive network upload error.' };
    }
  }

  /**
   * Lists backup archives stored in OneDrive
   */
  public async listBackups(): Promise<OneDriveBackupItem[]> {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const backups: OneDriveBackupItem[] = [];

    const fetchFolder = async (path: string) => {
      try {
        const res = await fetch(`https://graph.microsoft.com/v1.0${path}?$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const items = data.value || [];
          for (const it of items) {
            if (it.name && (it.name.startsWith('VISTAAR_Backup_') || it.name.endsWith('.zip') || it.name.endsWith('.json'))) {
              backups.push({
                id: it.id,
                name: it.name,
                sizeBytes: it.size || 0,
                createdDateTime: it.createdDateTime,
                lastModifiedDateTime: it.lastModifiedDateTime,
                webUrl: it.webUrl,
              });
            }
          }
        }
      } catch {
        // ignore
      }
    };

    // Check AppFolder first, then root folder
    await fetchFolder('/me/drive/special/approot/children');
    if (backups.length === 0) {
      await fetchFolder('/me/drive/root:/VISTAAR_Backups:/children');
    }

    return backups.sort((a, b) => new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime());
  }

  /**
   * Downloads a backup file from OneDrive
   */
  public async downloadBackup(itemId: string): Promise<Blob | null> {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        return await res.blob();
      }
    } catch (e) {
      console.warn('[OneDrive] Download error:', e);
    }
    return null;
  }

  /**
   * Deletes a backup file from OneDrive (for retention policy enforcement)
   */
  public async deleteBackup(itemId: string): Promise<boolean> {
    const token = await this.getValidAccessToken();
    if (!token) return false;

    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status === 204 || res.ok;
    } catch {
      return false;
    }
  }

  private updateLastBackupTimestamp(): void {
    const conn = this.getConnectionStatus();
    if (conn.isConnected) {
      conn.lastBackupAt = new Date().toISOString();
      this.saveConnectionStatus(conn);
    }
  }
}

export const oneDriveService = new OneDriveService();
