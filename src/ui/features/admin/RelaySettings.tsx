/** إعدادات الوسيط والنسخ الاحتياطي المؤقت + منطقة الخطر. */
import { useState } from 'react';
import type { ActivityEntry } from '@/domain/types';
import { formatDateTimeAr } from '@/utils/date';
import { testRelayConnection } from '@/services/relay';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';

const ACTIVITY_KIND: Record<ActivityEntry['type'], string> = {
  report: 'تقرير',
  attachment: 'مرفق',
  settings: 'إعدادات',
  task: 'مهمة',
  broadcast: 'تنبيه',
  approval: 'اعتماد',
  schedule: 'مناوبة',
  dayLog: 'سجل يوم',
  comment: 'تعليق جانبي',
  weeklyDigest: 'لقطة أسبوعية',
  sheetPush: 'دفع شيتس',
  sheetPull: 'سحب شيتس',
  emailVerify: 'تأكيد بريد',
  ack: 'تأكيد',
};

export function RelaySettings() {
  const { state, actions, syncing } = useApp();
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [mode, setMode] = useState(state.relay.mode);
  const [gasUrl, setGasUrl] = useState(state.relay.gasUrl);
  const [token, setToken] = useState(state.relay.token);
  const [enabled, setEnabled] = useState(state.relay.enabled);
  const [newGmail, setNewGmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const sendVerification = async (email: string, purpose: 'reverify' | 'change') => {
    setVerifyBusy(true);
    try {
      const code = await actions.requestEmailVerification(email, purpose);
      setSentCode(code);
      setVerifyCode('');
      toast(state.relay.mode === 'simulation' ? 'رمز الاختبار ظاهر أدناه' : 'أُرسل رمز التأكيد إلى البريد');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setVerifyBusy(false);
    }
  };

  const confirmVerification = async () => {
    const targetEmail = newGmail.trim() || state.admin!.email;
    setVerifyBusy(true);
    try {
      await actions.confirmAdminEmail(targetEmail, verifyCode);
      toast('تم تأكيد البريد الإداري وتحديث وجهة التقارير');
      setSentCode(null);
      setNewGmail('');
      setVerifyCode('');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setVerifyBusy(false);
    }
  };

  const save = async () => {
    await actions.updateRelayConfig({
      mode,
      gasUrl: gasUrl.trim(),
      token: token.trim(),
      enabled,
    });
    toast('تم حفظ إعدادات الوسيط');
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await testRelayConnection({ ...state.relay, mode, gasUrl: gasUrl.trim(), token: token.trim() });
      toast(result.ok ? 'الاتصال بالوسيط ناجح' : 'تعذّر الاتصال بالوسيط', result.ok ? 'info' : 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="stack">
      <Banner kind="info">
        التحديثات تُشفّر قبل إرسالها. بعد وصولها يرسل التطبيق تأكيد ACK فيحذف الوسيط التحديث المؤقت فوراً.
        وضع المحاكاة يعمل بدون أي إعداد ويمكنك تجربة دورة الإرسال/الحذف كاملة منه.
      </Banner>

      <div className="card card-pad stack">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>البريد الإداري الرسمي</h2>
            <p className="small muted" style={{ margin: '4px 0 0' }} dir="ltr">
              {state.admin?.email ?? '—'}
              {state.admin?.verifiedAt ? ` · ${formatDateTimeAr(state.admin.verifiedAt)}` : ''}
            </p>
          </div>
          <span className={`badge ${state.admin?.emailVerified ? 'badge-success' : 'badge-warning'}`}>
            {state.admin?.emailVerified ? '✓ Gmail مؤكَّد' : 'بانتظار التأكيد'}
          </span>
        </div>

        <div className="grid grid-2">
          <Field label="بريد Gmail جديد (اختياري)" hint="اتركه فارغاً لإعادة تأكيد البريد الحالي.">
            <input className="input" dir="ltr" type="email" placeholder="newadmin@gmail.com" value={newGmail} onChange={(event) => setNewGmail(event.target.value)} />
          </Field>
          <Field label="رمز التأكيد" hint="يظهر في وضع المحاكاة ويُرسل بالبريد في وضع GAS.">
            <input className="input" dir="ltr" inputMode="numeric" value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} />
          </Field>
        </div>

        {sentCode && state.relay.mode === 'simulation' && (
          <Banner kind="warning">رمز الاختبار المحلي: <strong dir="ltr">{sentCode}</strong></Banner>
        )}

        <div className="row">
          <button className="btn btn-secondary" disabled={verifyBusy} onClick={() => void sendVerification(newGmail.trim() || state.admin!.email, newGmail.trim() ? 'change' : 'reverify')}>
            {newGmail.trim() ? 'إرسال رمز تغيير البريد' : 'إرسال رمز إعادة التأكيد'}
          </button>
          <button className="btn btn-primary" disabled={verifyBusy || !verifyCode.trim()} onClick={() => void confirmVerification()}>
            تأكيد البريد الإداري
          </button>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          هذا البريد هو المرجع المعتمد لتقارير PDF الأسبوعية ولربط خدمات Google لاحقاً؛ لا حاجة لإدخاله مجدداً.
        </p>
      </div>

      <div className="card card-pad stack">
        <h2 style={{ margin: 0 }}>ربط وسيط Google Apps Script</h2>
        <div className="grid grid-2">
          <Field label="وضع الوسيط">
            <select className="select" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="simulation">محاكاة محلية (افتراضي)</option>
              <option value="gas">Google Apps Script</option>
            </select>
          </Field>
          <Field label="رابط Web App للسكربت" hint="انسخ الكود من gas/Code.gs وانشره ثم الصق الرابط هنا.">
            <input
              className="input"
              dir="ltr"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={gasUrl}
              onChange={(event) => setGasUrl(event.target.value)}
            />
          </Field>
          <Field label="السر المشترك (اختياري)" hint="يُطابق SECRET_TOKEN في السكربت. اتركه فارغاً في التجربة المحلية.">
            <input
              className="input"
              dir="ltr"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </Field>
          <Field label="وجهة التقرير الأسبوعي" hint="تُؤخذ تلقائياً من البريد الإداري المؤكَّد في البطاقة أعلاه.">
            <input className="input" dir="ltr" value={state.relay.adminEmail} disabled readOnly />
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          تفعيل المزامنة التلقائية بعد كل تعديل
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={save}>حفظ الإعدادات</button>
          <button className="btn btn-secondary" onClick={test} disabled={testing}>
            {testing ? 'جارٍ الفحص…' : 'فحص الاتصال'}
          </button>
          <button className="btn btn-secondary" onClick={() => void actions.sync()} disabled={syncing}>
            {syncing ? 'جارٍ المزامنة…' : 'مزامنة الآن'}
          </button>
        </div>
      </div>

      <div className="stat-grid stat-grid--relay">
        <div className="card stat">
          <div className="stat-label">رسائل بانتظار الإرسال</div>
          <div className="stat-value">{state.outbox.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">آخر مزامنة</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-md)', marginTop: 12 }}>
            {state.relay.lastSyncAt ? formatDateTimeAr(state.relay.lastSyncAt) : 'لم تتم بعد'}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">الوسيط الحالي</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-md)', marginTop: 12 }}>
            {state.relay.mode === 'gas' ? 'Google Apps Script' : 'محاكاة محلية'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>سجل النشاط</h2>
          <div className="row">
            <span className="badge">آخر 40 حدثاً</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { void actions.clearActivity(); toast('تم إفراغ سجل النشاط'); }}
            >إفراغ السجل</button>
          </div>
        </div>
        <div className="card-body">
          {state.activity.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>لا يوجد نشاط بعد. اكتب تقريراً أو اضغط «مزامنة الآن».</p>
          ) : (
            <div>
              {state.activity.slice(0, 20).map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <span className="row" style={{ gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                    <span className={`badge ${entry.ok ? 'badge-success' : 'badge-danger'}`}>
                      {entry.direction === 'out' ? 'إرسال' : 'استلام'}
                    </span>
                    <span className="badge badge-accent">{ACTIVITY_KIND[entry.type]}</span>
                    <span className="label">{entry.label}</span>
                    {(entry.count ?? 1) > 1 && <span className="badge">×{entry.count}</span>}
                  </span>
                  <span className="time">{formatDateTimeAr(entry.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad stack" style={{ borderColor: 'var(--danger)' }}>
        <h2 style={{ margin: 0, color: 'var(--danger)' }}>منطقة الخطر</h2>
        <p className="small muted" style={{ margin: 0 }}>
          إعادة الضبط تحذف المسؤول والكادر والتقارير والمرفقات من هذا المتصفح نهائياً.
        </p>
        <div>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('تأكيد حذف كل البيانات المحلية والبدء من الصفر؟')) {
                void actions.resetAll();
              }
            }}
          >إعادة ضبط النسخة التجريبية</button>
        </div>
      </div>
    </div>
  );
}
