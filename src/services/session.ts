/**
 * إدارة جلسة المستخدم.
 * ----------------------
 * الجلسة الآن محفوظة مشفّرة في localStorage (وليست sessionStorage)،
 * فتبقى بعد إغلاق التبويب أو تغيير الشبكة أو إعادة التحميل،
 * ولا تنتهي إلا عند الضغط على «تسجيل الخروج» أو إعادة ضبط النسخة.
 */
import type { Session } from '@/domain/types';
import { APP_CONFIG } from '@/config';
import { storage } from './storage';

function readLegacy(): Session | null {
  try {
    const raw = sessionStorage.getItem(APP_CONFIG.sessionKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Session;
    sessionStorage.removeItem(APP_CONFIG.sessionKey);
    return value;
  } catch {
    return null;
  }
}

export const session = {
  async get(): Promise<Session | null> {
    const encrypted = await storage.read<Session>(APP_CONFIG.sessionKey);
    if (encrypted) return encrypted;
    // ترحيل جلسة قديمة غير مشفّرة مرة واحدة فقط.
    const legacy = readLegacy();
    if (legacy) {
      await storage.write(APP_CONFIG.sessionKey, legacy);
      return legacy;
    }
    return null;
  },
  async set(value: Session): Promise<void> {
    readLegacy(); // تنظيف أي بقايا قديمة
    await storage.write(APP_CONFIG.sessionKey, value);
  },
  async clear(): Promise<void> {
    readLegacy();
    await storage.remove(APP_CONFIG.sessionKey);
  },
};
