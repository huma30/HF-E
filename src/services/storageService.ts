import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { optimizeImage, dataUrlToBlob, blobToDataUrl, ImagePresetKey } from '../utils/imageOptimizer';

export class StorageService {
  /**
   * Tracks whether Firebase Storage bucket is active and accessible.
   * If unconfigured or inaccessible, the app automatically and instantly uses
   * ultra-compact WebP Data URLs (<40 KB) that persist natively in Firestore.
   */
  private static isStorageActive: boolean | null = null;
  private static probePromise: Promise<boolean> | null = null;

  /**
   * Check if Cloud Storage is available
   */
  public static isAvailable(): boolean {
    return this.isStorageActive !== false;
  }

  /**
   * Helper to map folder name to optimization preset
   */
  private static getPresetForFolder(
    folder: 'products' | 'banners' | 'settings' | 'rewards' | 'receipts',
    customFilename?: string
  ): ImagePresetKey {
    if (folder === 'banners') return 'banner';
    if (folder === 'products') return 'product';
    if (folder === 'rewards') return 'reward';
    if (folder === 'settings') {
      if (customFilename?.toLowerCase().includes('qris')) return 'qris';
      if (customFilename?.toLowerCase().includes('receipt')) return 'receipt';
      return 'logo';
    }
    return 'custom';
  }

  /**
   * Probe once if Firebase Storage is working
   */
  private static async testStorageReachability(): Promise<boolean> {
    if (this.isStorageActive !== null) return this.isStorageActive;
    if (this.probePromise) return this.probePromise;

    this.probePromise = (async () => {
      try {
        const testRef = ref(storage, `_probe/ping_${Date.now()}.txt`);
        const probeBlob = new Blob(['1'], { type: 'text/plain' });
        
        const uploadPromise = uploadBytes(testRef, probeBlob);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Storage probe timeout')), 1500)
        );

        await Promise.race([uploadPromise, timeoutPromise]);
        this.isStorageActive = true;
        // Clean up ping file asynchronously
        deleteObject(testRef).catch(() => {});
        return true;
      } catch (err) {
        console.info(
          '[HUMA Storage] Firebase Cloud Storage bucket is not available. Seamlessly using ultra-fast WebP local data storage mode.'
        );
        this.isStorageActive = false;
        return false;
      } finally {
        this.probePromise = null;
      }
    })();

    return this.probePromise;
  }

  /**
   * Upload an image file or blob to Firebase Storage with automatic WebP compression.
   * Path example: /products/products_12345.webp
   */
  public static async uploadImage(
    fileOrBlob: File | Blob,
    folder: 'products' | 'banners' | 'settings' | 'rewards' | 'receipts',
    customFilename?: string,
    alreadyOptimized = false
  ): Promise<string> {
    // 1. Prepare and optimize image to WebP if needed
    const isSvg =
      fileOrBlob.type === 'image/svg+xml' ||
      (fileOrBlob instanceof File && fileOrBlob.name.toLowerCase().endsWith('.svg'));
    const isAlreadyWebp = alreadyOptimized || fileOrBlob.type === 'image/webp';

    let uploadBlob: Blob = fileOrBlob;
    let contentType = fileOrBlob.type || 'image/jpeg';
    let extension = 'jpg';

    if (isSvg) {
      contentType = 'image/svg+xml';
      extension = 'svg';
    } else if (isAlreadyWebp) {
      uploadBlob = fileOrBlob;
      contentType = 'image/webp';
      extension = 'webp';
    } else {
      const preset = this.getPresetForFolder(folder, customFilename);
      const optimized = await optimizeImage(fileOrBlob, { preset });
      uploadBlob = optimized.blob;
      contentType = optimized.format;
      extension = optimized.extension;
    }

    // 2. If storage is known to be unavailable, return WebP Data URL instantly (0-2ms)
    if (this.isStorageActive === false) {
      return await blobToDataUrl(uploadBlob);
    }

    // 3. Test reachability once before uploading
    const isReachable = await this.testStorageReachability();
    if (!isReachable) {
      return await blobToDataUrl(uploadBlob);
    }

    // 4. Upload to Firebase Storage
    try {
      let filename = customFilename;
      if (!filename) {
        filename = `${folder}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;
      } else if (!filename.endsWith(`.${extension}`)) {
        filename = `${filename.replace(/\.[^/.]+$/, '')}.${extension}`;
      }

      const storageRef = ref(storage, `${folder}/${filename}`);
      const metadata = {
        contentType,
        cacheControl: 'public, max-age=31536000',
      };

      const uploadPromise = uploadBytes(storageRef, uploadBlob, metadata).then((snapshot) =>
        getDownloadURL(snapshot.ref)
      );
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Firebase Storage timeout')), 2500)
      );

      return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (err: any) {
      console.info(
        `[HUMA Storage] Upload to /${folder}/ falling back to WebP Data URL: ${err?.message || 'timeout'}`
      );
      this.isStorageActive = false;
      return await blobToDataUrl(uploadBlob);
    }
  }

  /**
   * Upload a base64 Data URL to Firebase Storage with automatic WebP compression.
   */
  public static async uploadDataUrl(
    dataUrl: string,
    folder: 'products' | 'banners' | 'settings' | 'rewards' | 'receipts',
    filename?: string
  ): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      return dataUrl; // Already a remote URL or empty
    }

    // If Cloud Storage is not active, return the dataUrl instantly (0ms)
    if (this.isStorageActive === false) {
      return dataUrl;
    }

    try {
      const isAlreadyWebp = dataUrl.startsWith('data:image/webp');
      let blob: Blob;

      if (isAlreadyWebp) {
        blob = dataUrlToBlob(dataUrl);
      } else {
        const preset = this.getPresetForFolder(folder, filename);
        const optimized = await optimizeImage(dataUrl, { preset });
        blob = optimized.blob;
      }

      return await this.uploadImage(blob, folder, filename, true);
    } catch (err) {
      return dataUrl;
    }
  }

  /**
   * Safely delete an image from Firebase Storage if it belongs to Firebase Storage.
   */
  public static async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl || !imageUrl.includes('firebasestorage.googleapis.com')) {
      return; // External image or data url
    }

    try {
      const storageRef = ref(storage, imageUrl);
      await deleteObject(storageRef);
    } catch (err) {
      console.warn('[HUMA Storage] Error deleting storage object (non-critical):', err);
    }
  }

  /**
   * Utility to trim payload and remove all undefined values before saving to Firestore.
   */
  public static cleanPayload<T extends Record<string, any>>(data: T): T {
    const cleaned: any = Array.isArray(data) ? [] : {};
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val !== undefined) {
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          cleaned[key] = this.cleanPayload(val);
        } else {
          cleaned[key] = val;
        }
      }
    }
    return cleaned;
  }
}

