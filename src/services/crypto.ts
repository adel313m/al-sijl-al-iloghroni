/**
 * خدمة التشفير (Crypto Service)
 * -----------------------------
 * تعتمد على Web Crypto API المدمجة في المتصفح:
 *  - AES-GCM 256 لتشفير البيانات المخزنة والمرسلة للوسيط.
 *  - PBKDF2-SHA256 لاشتقاق المفتاح من عبارة مرور + ملح عشوائي.
 *  - PBKDF2-SHA256 لتجزئة رمز PIN/كلمة المرور مع مقارنة ثابتة الزمن.
 *
 * هذه الطبقة مستقلة تماماً عن التخزين والواجهة، ويمكن استبدالها لاحقاً
 * بمفتاح يأتي من خادم (KMS) دون تغيير باقي الكود.
 */
import { APP_CONFIG } from '@/config';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** مقارنة ثابتة الزمن لتجنب هجمات التوقيت على الرموز السرية. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

class CryptoService {
  private keyPromise: Promise<CryptoKey> | null = null;

  /** ينشئ الملح مرة واحدة ويحتفظ به في التخزين، ثم يشتق مفتاح AES. */
  private async getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = this.deriveKey();
    }
    return this.keyPromise;
  }

  private async deriveKey(): Promise<CryptoKey> {
    let salt = fromBase64(localStorage.getItem(APP_CONFIG.cryptoSaltKey) || '');
    if (salt.length < 16) {
      salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem(APP_CONFIG.cryptoSaltKey, toBase64(salt));
    }
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(APP_CONFIG.demoPassphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /** يشفر نصاً ويعيد سلة بصيغة: v1.<iv>.<ciphertext> (كلها Base64). */
  async encrypt(plain: string): Promise<string> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encoder.encode(plain),
    );
    return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
  }

  /** يفك السلة المنتجة بواسطة encrypt(). */
  async decrypt(payload: string): Promise<string> {
    const [version, ivPart, cipherPart] = payload.split('.');
    if (version !== 'v1' || !ivPart || !cipherPart) {
      throw new Error('صيغة البيانات المشفّرة غير صحيحة');
    }
    const key = await this.getKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivPart) as BufferSource },
      key,
      fromBase64(cipherPart) as BufferSource,
    );
    return decoder.decode(plain);
  }

  /** تجزئة سر (PIN / كلمة مرور) مع ملح عشوائي. */
  async hashSecret(secret: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
      'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
      baseKey,
      256,
    );
    return `v1.${toBase64(salt)}.${toBase64(new Uint8Array(bits))}`;
  }

  /** تحقق من سر مقابل التجزئة المخزّنة بمقارنة ثابتة الزمن. */
  async verifySecret(secret: string, stored: string): Promise<boolean> {
    try {
      const [version, saltPart, hashPart] = stored.split('.');
      if (version !== 'v1' || !saltPart || !hashPart) return false;
      const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
        'deriveBits',
      ]);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: fromBase64(saltPart) as BufferSource, iterations: 100_000, hash: 'SHA-256' },
        baseKey,
        256,
      );
      return constantTimeEqual(new Uint8Array(bits), fromBase64(hashPart));
    } catch {
      return false;
    }
  }
}

export const cryptoService = new CryptoService();
