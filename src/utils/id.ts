/** مُولّد معرّفات فريد مع توافق احتياطي مع المتصفحات القديمة. */
export function newId(prefix = 'id'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}

/**
 * رمز سري عشوائي من الأرقام. يُولَّد من مصدر عشوائي مشفّر (لا من Math.random)
 * لتقليل تكرار الرموز المتشابهة بين أعضاء الكادر.
 */
export function generatePin(length = 6): string {
  const digits: number[] = [];
  const limit = 256 - (256 % 10); // رفض الانحياز الناتج عن modulo
  while (digits.length < length) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    if (byte < limit) digits.push(byte % 10);
  }
  return digits.join('');
}
