/** أدوات التاريخ/الوقت — كلها تعتمد على توقيت الجهاز المحلي. */

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateAr(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** صيغة الدفتر الرسمي: 2026 / 11 / 24 */
export function formatDateNumeric(key: string): string {
  return key.replace(/-/g, ' / ');
}

export function formatDateTimeAr(iso: string): string {
  return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
}

/** نقل تاريخ YYYY-MM-DD بعدد أيام (سالب للخلف) مع ضبط الحدود. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayKey(date);
}
