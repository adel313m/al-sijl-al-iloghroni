/**
 * طبقة الوسيط (Relay Adapter)
 * ---------------------------
 * تنقل التحديثات المشفّرة بين الجهاز ووسيط مؤقت، ثم ترسل تأكيد استلام (ACK)
 * ليقوم الوسيط بحذف التحديث. توجد نسختان:
 *   1) SimulationRelay: طابور محلي في المتصفح — يعمل فوراً دون إعداد.
 *   2) GasRelay: يتصل بتطبيق Google Apps Script منشور كـ Web App.
 *
 * كلا النسختين تطبّقان الواجهة نفسها، لذا إضافة وسيط آخر لاحقاً (Firebase،
 * خادم Node...) لا تتطلب تغيير أي شيء في الواجهة أو منطق التطبيق.
 */
import type { RelayConfig, RelayMessage, SheetSnapshot, SheetSyncPayload } from '@/domain/types';
import { newId } from '@/utils/id';

export interface RelayResult {
  ok: boolean;
  error?: string;
}

export interface RelayAdapter {
  readonly kind: RelayConfig['mode'];
  push(message: RelayMessage, config: RelayConfig): Promise<RelayResult>;
  pull(config: RelayConfig): Promise<RelayMessage[]>;
  ack(id: string, config: RelayConfig): Promise<RelayResult>;
  sendVerificationCode(email: string, code: string, config: RelayConfig): Promise<RelayResult>;
  sheetPush(payload: SheetSyncPayload, config: RelayConfig): Promise<RelayResult>;
  sheetPull(config: RelayConfig): Promise<SheetSnapshot | null>;
}

interface SimEntry {
  message: RelayMessage;
  expiresAt: number; // حذف تلقائي احتياطي بعد 24 ساعة حتى بدون ACK
}

const SIM_QUEUE_KEY = 'sijl.relay.sim.queue.v1';
const SIM_TTL_MS = 24 * 60 * 60 * 1000;

/** وسيط محاكى: طابور في localStorage يحاكي التخزين المؤقت للسكربت. */
export class SimulationRelay implements RelayAdapter {
  readonly kind = 'simulation' as const;

  private readQueue(): SimEntry[] {
    try {
      const raw = localStorage.getItem(SIM_QUEUE_KEY);
      if (!raw) return [];
      const entries = JSON.parse(raw) as SimEntry[];
      const now = Date.now();
      return entries.filter((entry) => entry.expiresAt > now);
    } catch {
      return [];
    }
  }

  private writeQueue(entries: SimEntry[]): void {
    localStorage.setItem(SIM_QUEUE_KEY, JSON.stringify(entries));
  }

  async push(message: RelayMessage): Promise<RelayResult> {
    const entries = this.readQueue();
    if (!entries.some((entry) => entry.message.id === message.id)) {
      entries.push({ message, expiresAt: Date.now() + SIM_TTL_MS });
      this.writeQueue(entries);
    }
    return { ok: true };
  }

  async pull(): Promise<RelayMessage[]> {
    return this.readQueue().map((entry) => entry.message);
  }

  async ack(id: string): Promise<RelayResult> {
    this.writeQueue(this.readQueue().filter((entry) => entry.message.id !== id));
    return { ok: true };
  }

  // في وضع المحاكاة لا يُرسل بريد فعلي؛ الرمز يُعرض في الواجهة بوضوح.
  async sendVerificationCode(): Promise<RelayResult> {
    return { ok: true };
  }

  // المحاكاة لا تتصل بـ Sheets؛ المستودع يستخدم نسخة sheetMirror المشفّرة محلياً.
  async sheetPush(): Promise<RelayResult> {
    return { ok: false, error: 'وضع المحاكاة لا يرسل إلى Google Sheets' };
  }

  async sheetPull(): Promise<SheetSnapshot | null> {
    return null;
  }
}

/** وسيط Google Apps Script: يرسل/يسحب/يؤكد الحذف عبر Web App منشور. */
export class GasRelay implements RelayAdapter {
  readonly kind = 'gas' as const;

  private async call<T>(config: RelayConfig, body: unknown): Promise<T> {
    if (!config.gasUrl.trim()) throw new Error('لم يتم إدخال رابط Google Apps Script بعد');
    // إرسال JSON كنصّ عادي لتجنب طلبات CORS المسبقة (preflight) التي لا يدعمها GAS غالباً.
    const response = await fetch(config.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow', // GAS يعيد التوجيه إلى script.googleusercontent.com
    });
    if (!response.ok) throw new Error(`استجابة الوسيط: ${response.status}`);
    const result = (await response.json()) as { ok: boolean; data?: T; error?: string };
    if (!result.ok) throw new Error(result.error || 'فشل طلب الوسيط');
    return result.data as T;
  }

  async push(message: RelayMessage, config: RelayConfig): Promise<RelayResult> {
    try {
      await this.call(config, { action: 'push', message, token: config.token, requestId: newId('req') });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async pull(config: RelayConfig): Promise<RelayMessage[]> {
    try {
      return await this.call<RelayMessage[]>(config, { action: 'pull', token: config.token });
    } catch (error) {
      console.error('[Relay] فشل السحب من GAS:', error);
      return [];
    }
  }

  async ack(id: string, config: RelayConfig): Promise<RelayResult> {
    try {
      await this.call(config, { action: 'ack', id, token: config.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** فحص اتصال دون تخزين أي رسالة في الوسيط. */
  async ping(config: RelayConfig): Promise<RelayResult> {
    try {
      await this.call(config, { action: 'ping', token: config.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** إرسال رمز تأكيد البريد الإداري عبر MailApp في السكربت. */
  async sendVerificationCode(email: string, code: string, config: RelayConfig): Promise<RelayResult> {
    try {
      await this.call(config, { action: 'sendVerificationCode', email, code, token: config.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** دفع نسخة الكادر والوجبات إلى أوراق Google Sheets. */
  async sheetPush(payload: SheetSyncPayload, config: RelayConfig): Promise<RelayResult> {
    try {
      await this.call(config, { action: 'sheetPush', payload, token: config.token });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** سحب نسخة الكادر والوجبات من أوراق Google Sheets. */
  async sheetPull(config: RelayConfig): Promise<SheetSnapshot | null> {
    try {
      return await this.call<SheetSnapshot>(config, {
        action: 'sheetPull',
        token: config.token,
        sheetConfig: {
          spreadsheetId: config.spreadsheetId,
          staffSheet: config.staffSheet,
          shiftsSheet: config.shiftsSheet,
        },
      });
    } catch (error) {
      console.error('[Relay] فشل السحب من Google Sheets:', error);
      throw error;
    }
  }
}

const simulationRelay = new SimulationRelay();
const gasRelay = new GasRelay();

/** اختيار الوسيط حسب إعدادات المسؤول — نقطة التبديل المركزية. */
export function getRelayAdapter(config: RelayConfig): RelayAdapter {
  return config.mode === 'gas' && config.gasUrl.trim() ? gasRelay : simulationRelay;
}

/** فحص اتصال بسيط يُستخدم من شاشة إعدادات الوسيط. */
export async function testRelayConnection(config: RelayConfig): Promise<RelayResult> {
  const adapter = getRelayAdapter(config);
  if (adapter.kind === 'simulation') return { ok: true };
  if (!config.gasUrl.trim()) return { ok: false, error: 'أدخل رابط السكربت أولاً' };
  // pull يبتلع أخطاء الشبكة، لذا نستخدم ping صريحاً للتحقق من الاتصال.
  return gasRelay.ping(config);
}
