import { supabase } from '../../lib/supabase';
import { handleSupabaseError } from '../../lib/supabaseError';

export type StorageBucket = 'avatars' | 'business-assets' | 'product-media' | 'documents';

export class SupabaseStorageService {
  public async getSignedUrl(
    bucket: StorageBucket,
    path: string,
    expiresInSeconds: number = 3600
  ): Promise<{ signedUrl?: string; error?: string }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);

      if (error) {
        const errStr = handleSupabaseError(error, 'getSignedUrl');
        return { error: errStr };
      }
      return { signedUrl: data?.signedUrl };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getSignedUrl');
      return { error: errStr };
    }
  }

  public async uploadFile(params: {
    bucket: StorageBucket;
    workspaceId: string;
    folder: string;
    fileName: string;
    fileBody: Blob | File | ArrayBuffer | string;
    contentType?: string;
  }): Promise<{ path?: string; error?: string }> {
    const { bucket, workspaceId, folder, fileName, fileBody, contentType } = params;

    const cleanFolder = folder.replace(/\.\./g, '').replace(/^\/+/, '');
    const cleanFileName = fileName.replace(/\.\./g, '').replace(/^\/+/, '');
    const safePath = `${workspaceId}/${cleanFolder}/${cleanFileName}`;

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(safePath, fileBody, {
          contentType,
          upsert: true,
        });

      if (error) {
        const errStr = handleSupabaseError(error, 'uploadFile');
        return { error: errStr };
      }
      return { path: data?.path };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'uploadFile');
      return { error: errStr };
    }
  }

  public async deleteFile(bucket: StorageBucket, path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) {
        const errStr = handleSupabaseError(error, 'deleteFile');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteFile');
      return { success: false, error: errStr };
    }
  }
}

export const storageService = new SupabaseStorageService();
