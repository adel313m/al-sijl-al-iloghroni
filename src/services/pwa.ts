/**
 * تسجيل Service Worker وطلب مزامنة الخلفية.
 * الفشل في أي خطوة لا يجب أن يعطل التطبيق؛ لذلك كل شيء محاط بمحاولة/التقاط.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.warn('[PWA] تعذّر تسجيل Service Worker:', error);
    });
  });
}

/** اطلب من الـ SW إعادة إرسال أي تغييرات معلّقة عند عودة الشبكة. */
export async function requestBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (syncManager) await syncManager.register('sijl-outbox-sync');
  } catch {
    /* المتصفح لا يدعم Background Sync — حدث online في الواجهة يكفي. */
  }
}
