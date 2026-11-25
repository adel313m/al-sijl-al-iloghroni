/**
 * طبقة تجريد التخزين (Storage Adapter)
 * -------------------------------------
 * الواجهة مجردة من أي تقنية، والنسخة الحالية تستخدم localStorage
 * مع تشفير AES-GCM لكل قيمة. لاحقاً يمكن إضافة S3/IndexedDB/خادم سحابي
 * بتطبيق الواجهة نفسها دون لمس منطق التطبيق أو الواجهة.
 */
import type { AppState } from '@/domain/types';
import { APP_CONFIG } from '@/config';
import { cryptoService } from './crypto';

export interface StorageAdapter {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** تخزين محلي مشفّر — التنفيذ الافتراضي في المرحلة الأولى. */
export class LocalEncryptedStorage implements StorageAdapter {
  async read<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(await cryptoService.decrypt(raw)) as T;
    } catch (error) {
      console.error('[Storage] فشل فك تشفير البيانات:', error);
      return null;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    const encrypted = await cryptoService.encrypt(JSON.stringify(value));
    try {
      localStorage.setItem(key, encrypted);
    } catch (error) {
      throw new Error('امتلأت مساحة التخزين المحلية في المتصفح؛ جرّب مرفقات أصغر أو احذف بعض الملفات من المكتبة.');
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}

export const storage: StorageAdapter = new LocalEncryptedStorage();

/** قراءة/كتابة حالة التطبيق عبر الـ Adapter (نقطة الدخول الوحيدة). */
export const stateStorage = {
  load: () => storage.read<AppState>(APP_CONFIG.storageKey),
  save: (state: AppState) => storage.write(APP_CONFIG.storageKey, state),
  reset: () => storage.remove(APP_CONFIG.storageKey),
};
