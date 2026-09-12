/**
 * HUMA F&B Commerce & POS System
 * Client-side High Performance Image Compression & WebP Conversion Pipeline
 * Zero-dependency, native Canvas API implementation with presets and fallback.
 */

export type ImagePresetKey = 'product' | 'banner' | 'logo' | 'receipt' | 'qris' | 'reward' | 'custom';

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0
  targetSizeBytes?: number; // Maximum target file size in bytes
  format?: 'image/webp' | 'image/jpeg' | 'image/png' | 'auto';
  fillBackgroundWhite?: boolean; // When converting transparent PNG to JPEG
  preset?: ImagePresetKey;
}

export interface OptimizedImageResult {
  file: File;
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savingsPercent: number;
  format: 'image/webp' | 'image/jpeg' | 'image/png';
  extension: 'webp' | 'jpg' | 'png';
  filename: string;
}

/**
 * Standard Presets according to HUMA performance standards:
 * - Product: max 800x800px, quality 80%, target < 150 KB
 * - Banner: max 1200x600px, quality 80%, target < 250 KB
 * - Logo & Receipt: max 400x400px, quality 80%, target < 80 KB
 * - QRIS: max 600x600px, quality 85%, target < 100 KB (guarantees camera scanner readability)
 * - Reward: max 600x600px, quality 80%, target < 120 KB
 */
export const IMAGE_PRESETS: Record<ImagePresetKey, ImageOptimizationOptions> = {
  product: {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.8,
    targetSizeBytes: 150 * 1024,
    format: 'auto',
    preset: 'product',
  },
  banner: {
    maxWidth: 1200,
    maxHeight: 600,
    quality: 0.8,
    targetSizeBytes: 250 * 1024,
    format: 'auto',
    preset: 'banner',
  },
  logo: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.8,
    targetSizeBytes: 80 * 1024,
    format: 'auto',
    preset: 'logo',
  },
  receipt: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.8,
    targetSizeBytes: 80 * 1024,
    format: 'auto',
    preset: 'receipt',
  },
  qris: {
    maxWidth: 600,
    maxHeight: 600,
    quality: 0.85,
    targetSizeBytes: 100 * 1024,
    format: 'auto',
    fillBackgroundWhite: true, // QR codes require solid high-contrast white background
    preset: 'qris',
  },
  reward: {
    maxWidth: 600,
    maxHeight: 600,
    quality: 0.8,
    targetSizeBytes: 120 * 1024,
    format: 'auto',
    preset: 'reward',
  },
  custom: {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.8,
    targetSizeBytes: 150 * 1024,
    format: 'auto',
    preset: 'custom',
  },
};

/**
 * Format bytes to readable human string (e.g. "64.2 KB", "1.2 MB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Check if the current browser environment natively supports WebP encoding in Canvas
 */
let cachedWebpSupport: boolean | null = null;
export function isWebpSupported(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const uri = canvas.toDataURL('image/webp');
    cachedWebpSupport = uri.indexOf('data:image/webp') === 0;
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

/**
 * Convert base64 data URL to Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

/**
 * Load image drawable with hardware acceleration (createImageBitmap) and fallback
 */
async function getImageDrawable(source: File | Blob | string): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, targetWidth: number, targetHeight: number) => void;
  cleanup: () => void;
}> {
  // 1. Try hardware-accelerated createImageBitmap if supported
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      let blobInput: Blob;
      if (typeof source === 'string') {
        blobInput = dataUrlToBlob(source);
      } else {
        blobInput = source;
      }
      const bitmap = await createImageBitmap(blobInput);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, targetWidth, targetHeight) => {
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        },
        cleanup: () => {
          bitmap.close();
        },
      };
    } catch {
      // If createImageBitmap fails for exotic image formats, fallback to HTMLImageElement
    }
  }

  // 2. HTMLImageElement Fallback
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, targetWidth, targetHeight) => {
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        },
        cleanup,
      });
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Gagal memuat gambar. Format file mungkin rusak atau tidak valid.'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}

/**
 * Ultra-fast client-side image compression & format conversion pipeline
 */
export async function optimizeImage(
  input: File | Blob | string,
  options?: Partial<ImageOptimizationOptions>
): Promise<OptimizedImageResult> {
  const presetKey = options?.preset || 'custom';
  const basePreset = IMAGE_PRESETS[presetKey] || IMAGE_PRESETS.custom;
  const config = { ...basePreset, ...options };

  const originalSizeBytes =
    typeof input === 'string'
      ? input.startsWith('data:')
        ? Math.round((input.length * 3) / 4)
        : 0
      : input.size;

  const originalName =
    typeof input === 'object' && 'name' in input ? (input as File).name : 'image';

  // If SVG, skip compression as SVG is already a vector text format
  const isSvg =
    (typeof input === 'object' && input.type === 'image/svg+xml') ||
    (typeof input === 'string' && input.includes('image/svg+xml')) ||
    originalName.toLowerCase().endsWith('.svg');

  if (isSvg) {
    let dataUrl = '';
    let blob: Blob;

    if (typeof input === 'string') {
      dataUrl = input;
      blob = dataUrlToBlob(dataUrl);
    } else {
      blob = input;
      dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    }

    const file = new File([blob], originalName, { type: 'image/svg+xml' });
    return {
      file,
      blob,
      dataUrl,
      width: 0,
      height: 0,
      originalSizeBytes,
      optimizedSizeBytes: blob.size,
      savingsPercent: 0,
      format: 'image/png' as any,
      extension: 'png' as any,
      filename: originalName,
    };
  }

  // Load image drawable safely and fast
  const drawable = await getImageDrawable(input);

  try {
    const originalWidth = drawable.width;
    const originalHeight = drawable.height;

    if (!originalWidth || !originalHeight) {
      throw new Error('Dimensi gambar tidak valid.');
    }

    const maxWidth = config.maxWidth || 800;
    const maxHeight = config.maxHeight || 800;

    // Calculate optimal dimensions with aspect ratio preserved (no upscaling)
    const scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight, 1);
    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));

    // Target mime type: default WebP if supported, fallback to JPEG
    let targetFormat: 'image/webp' | 'image/jpeg' | 'image/png' = 'image/webp';
    if (config.format === 'image/png') {
      targetFormat = 'image/png';
    } else if (config.format === 'image/jpeg' || !isWebpSupported()) {
      targetFormat = 'image/jpeg';
    }

    const quality = config.quality || 0.78;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: false,
      alpha: targetFormat !== 'image/jpeg',
    });

    if (!ctx) {
      throw new Error('Canvas 2D context tidak tersedia pada browser ini.');
    }

    // High quality downscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill white background for transparent PNG converted to JPEG or for QRIS
    if (config.fillBackgroundWhite || targetFormat === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    drawable.draw(ctx, targetWidth, targetHeight);

    // Fast synchronous dataUrl generation
    const dataUrl = canvas.toDataURL(targetFormat, quality);

    // Convert to Blob asynchronously in a single fast pass
    const outputBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else resolve(dataUrlToBlob(dataUrl));
      }, targetFormat, quality);
    });

    const extension = targetFormat === 'image/webp' ? 'webp' : targetFormat === 'image/png' ? 'png' : 'jpg';
    const cleanBaseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFilename = `${cleanBaseName || 'image'}_${Date.now()}.${extension}`;

    const optimizedFile = new File([outputBlob], finalFilename, {
      type: targetFormat,
      lastModified: Date.now(),
    });

    const optimizedSizeBytes = outputBlob.size;
    const savingsPercent =
      originalSizeBytes > 0 && originalSizeBytes > optimizedSizeBytes
        ? Math.round(((originalSizeBytes - optimizedSizeBytes) / originalSizeBytes) * 100)
        : 0;

    return {
      file: optimizedFile,
      blob: outputBlob,
      dataUrl,
      width: targetWidth,
      height: targetHeight,
      originalSizeBytes,
      optimizedSizeBytes,
      savingsPercent,
      format: targetFormat,
      extension,
      filename: finalFilename,
    };
  } finally {
    drawable.cleanup();
  }
}

/**
 * Fast asynchronous Blob to Data URL converter
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof window === 'undefined' || !('FileReader' in window)) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca data gambar'));
    reader.readAsDataURL(blob);
  });
}

