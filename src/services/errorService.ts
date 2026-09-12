/**
 * HUMA Central Error Service
 * Handles classification, sanitization, exponential retry, and logging
 */

export type ErrorClassification =
  | 'SYNTAX_ERROR'
  | 'RUNTIME_ERROR'
  | 'LOGIC_ERROR'
  | 'DATABASE_ERROR'
  | 'AUTH_ERROR'
  | 'PERMISSION_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'UI_ERROR'
  | 'STATE_ERROR'
  | 'FIREBASE_ERROR'
  | 'QUOTA_ERROR'
  | 'UPLOAD_ERROR'
  | 'PRINT_ERROR'
  | 'BROWSER_COMPATIBILITY_ERROR'
  | 'SECURITY_ERROR';

export interface AppError {
  id: string;
  classification: ErrorClassification;
  originalMessage: string;
  userMessage: string;
  timestamp: string;
  context?: Record<string, any>;
  stack?: string;
}

class CentralErrorService {
  private errorListeners: ((err: AppError) => void)[] = [];
  private recentErrors: AppError[] = [];

  public classify(error: unknown): ErrorClassification {
    if (!error) return 'RUNTIME_ERROR';
    const rawMessage = (error as any)?.message;
    const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? error ?? '');
    
    const rawCode = (error as any)?.code;
    const code = typeof rawCode === 'string' ? rawCode : (rawCode !== undefined && rawCode !== null ? String(rawCode) : '');

    const lowerMessage = message.toLowerCase();
    const lowerCode = code.toLowerCase();

    if (
      lowerCode.includes('permission') ||
      lowerMessage.includes('permission') ||
      lowerMessage.includes('insufficient') ||
      lowerCode.includes('denied')
    ) {
      return 'PERMISSION_ERROR';
    }
    if (lowerCode.includes('auth/') || lowerMessage.includes('auth') || lowerCode.includes('unauthenticated')) {
      return 'AUTH_ERROR';
    }
    const isOffline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? !navigator.onLine : false;
    if (lowerCode.includes('unavailable') || lowerMessage.includes('network') || lowerMessage.includes('offline') || isOffline) {
      return 'NETWORK_ERROR';
    }
    if (lowerCode.includes('resource-exhausted') || lowerMessage.includes('quota')) {
      return 'QUOTA_ERROR';
    }
    if (lowerCode.includes('firestore') || lowerMessage.includes('database')) {
      return 'DATABASE_ERROR';
    }
    if (lowerMessage.includes('upload') || lowerMessage.includes('image')) {
      return 'UPLOAD_ERROR';
    }
    if (lowerMessage.includes('print') || lowerMessage.includes('bluetooth')) {
      return 'PRINT_ERROR';
    }
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    return 'RUNTIME_ERROR';
  }

  public normalize(error: unknown, fallbackMessage = 'Terjadi kendala. Silakan coba lagi.'): AppError {
    const classification = this.classify(error);
    const originalMessage = (error as any)?.message || String(error);
    
    // User-friendly mapping
    let userMessage = fallbackMessage;
    if (classification === 'NETWORK_ERROR') {
      userMessage = 'Koneksi internet terputus. Mohon periksa jaringan Anda.';
    } else if (classification === 'AUTH_ERROR') {
      userMessage = 'Email atau kata sandi tidak sesuai.';
    } else if (classification === 'PERMISSION_ERROR') {
      userMessage = 'Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.';
    } else if (classification === 'QUOTA_ERROR') {
      userMessage = 'Batas layanan sementara tercapai. Mohon tunggu beberapa saat.';
    } else if (classification === 'VALIDATION_ERROR') {
      userMessage = originalMessage; // Usually safe if tailored
    }

    return {
      id: 'ERR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      classification,
      originalMessage,
      userMessage,
      timestamp: new Date().toISOString(),
      stack: (error as any)?.stack,
    };
  }

  public capture(error: unknown, context?: Record<string, any>): AppError {
    const appError = this.normalize(error);
    if (context) {
      appError.context = context;
    }
    this.log(appError);
    return appError;
  }

  public log(appError: AppError): void {
    this.recentErrors.unshift(appError);
    if (this.recentErrors.length > 50) {
      this.recentErrors.pop();
    }
    // Safe console logging for admins/developers without leaking in production UI
    console.error(`[HUMA-ERROR][${appError.classification}] ${appError.originalMessage}`, appError);

    // Notify UI listeners
    this.errorListeners.forEach((listener) => {
      try {
        listener(appError);
      } catch (err) {
        console.error('Error in errorListener', err);
      }
    });
  }

  public subscribe(listener: (err: AppError) => void): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    };
  }

  public getRecentErrors(): AppError[] {
    return [...this.recentErrors];
  }

  /**
   * Retry an operation with exponential backoff
   */
  public async retry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 500
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) break;
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw lastError;
  }
}

export const errorService = new CentralErrorService();
