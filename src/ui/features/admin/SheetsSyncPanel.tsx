/** لوحة مشتركة لربط الكادر والوجبات بـ Google Sheets عبر GAS. */
import { useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';

export function SheetsSyncPanel() {
  const { state, actions } = useApp();
  const toast = useToast();
  const [gasUrl, setGasUrl] = useState(state.relay.gasUrl);
  const [spreadsheetId, setSpreadsheetId] = useState(state.relay.spreadsheetId);
  const [staffSheet, setStaffSheet] = useState(state.relay.staffSheet);
  const [shiftsSheet, setShiftsSheet] = useState(state.relay.shiftsSheet);
  const [busy, setBusy] = useState<'save' | 'push' | 'pull' | null>(null);

  const isGas = state.relay.mode === 'gas';

  const save = async () => {
    setBusy('save');
    try {
      await actions.updateRelayConfig({
        gasUrl: gasUrl.trim(),
        spreadsheetId: spreadsheetId.trim(),
        staffSheet: staffSheet.trim() || 'Staff_Directory',
        shiftsSheet: shiftsSheet.trim() || 'Shifts_Order',
      });
      toast('تم حفظ إعدادات Google Sheets');
    } finally {
      setBusy(null);
    }
  };

  const push = async () => {
    setBusy('push');
    try {
      await actions.pushSheets();
      toast(isGas ? 'تم دفع الكادر والوجبات إلى Google Sheets' : 'تم حفظ نسخة محاكاة مشفّرة محلياً للسحب');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const pull = async () => {
    setBusy('pull');
    try {
      await actions.pullSheets();
      toast('تم سحب الكادر وترتيب الوجبات وتحديث التخزين المحلي المشفّر');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card card-pad stack sync-panel">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>مزامنة Google Sheets</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            التخزين المحلي المشفّر هو قاعدة التشغيل الأساسية؛ Sheets دفتر مرجعي للمزامنة فقط.
          </p>
        </div>
        <span className={`badge ${isGas ? 'badge-success' : 'badge-warning'}`}>
          {isGas ? 'Google Apps Script' : 'محاكاة محلية'}
        </span>
      </div>

      <Banner kind={isGas ? 'info' : 'warning'}>
        {isGas
          ? 'الرموز تُرسل إلى الأوراق كتجزئة PBKDF2 وقيمة مشفّرة فقط، ولا تُحفظ كنص صريح في Google Sheets.'
          : 'وضع المحاكاة: الدفع يحفظ نسخة مشفّرة داخل التطبيق، والسحب يقرأها لاختبار الزرين دون إعداد سكربت.'}
      </Banner>

      <div className="grid grid-2">
        <Field label="رابط Web App للسكربت">
          <input className="input" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" value={gasUrl} onChange={(event) => setGasUrl(event.target.value)} />
        </Field>
        <Field label="معرّف أو اسم ملف Google Sheets" hint="يُفضّل المعرّف من رابط الملف.">
          <input className="input" dir="ltr" placeholder="1AbC... أو Staff_Registry" value={spreadsheetId} onChange={(event) => setSpreadsheetId(event.target.value)} />
        </Field>
        <Field label="ورقة الكادر">
          <input className="input" dir="ltr" value={staffSheet} onChange={(event) => setStaffSheet(event.target.value)} />
        </Field>
        <Field label="ورقة ترتيب الوجبات">
          <input className="input" dir="ltr" value={shiftsSheet} onChange={(event) => setShiftsSheet(event.target.value)} />
        </Field>
      </div>

      <div className="row">
        <button className="btn btn-secondary" onClick={() => void save()} disabled={Boolean(busy)}>حفظ إعدادات الأوراق</button>
        <button className="btn btn-primary" onClick={() => void pull()} disabled={Boolean(busy)}>
          {busy === 'pull' ? 'جارٍ السحب…' : 'سحب من Google Sheets'}
        </button>
        <button className="btn btn-secondary" onClick={() => void push()} disabled={Boolean(busy)}>
          {busy === 'push' ? 'جارٍ الدفع…' : 'دفع إلى Google Sheets'}
        </button>
      </div>
    </div>
  );
}
