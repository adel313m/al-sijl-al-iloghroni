/**
 * شاشة الدخول — تفصل بوضوح بين المسؤول والكادر.
 * الدخول هنا محاكى بالكامل داخل المتصفح (لا خادم مصادقة بعد)،
 * لكن الرموز تُخزّن كتجزئة PBKDF2 وليس كنص صريح.
 */
import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';

type Mode = 'admin' | 'staff';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('admin');

  return (
    <div className="login-page">
      <div className="login-wrap">
        <div className="login-hero">
          <div className="brand">
            <div className="brand-mark">س</div>
            <div>
              <div className="brand-name">السجل الإلكتروني</div>
              <div className="brand-sub">المناوبات والتقارير اليومية المتتابعة</div>
            </div>
          </div>
          <h1>مرحباً بك</h1>
          <p>اختر نوع الدخول للمتابعة إلى السجل اليومي</p>
        </div>

        <div className="login-tabs" role="tablist" aria-label="نوع الدخول">
          <button
            className={`login-tab${mode === 'admin' ? ' active' : ''}`}
            onClick={() => setMode('admin')}
            role="tab"
            aria-selected={mode === 'admin'}
          >المسؤول · Gmail مؤكَّد</button>
          <button
            className={`login-tab${mode === 'staff' ? ' active' : ''}`}
            onClick={() => setMode('staff')}
            role="tab"
            aria-selected={mode === 'staff'}
          >الكادر · الاسم والرمز</button>
        </div>

        {mode === 'admin' ? <AdminLogin /> : <StaffLogin />}

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 'var(--s6)' }}>
          النسخة الأولى — بياناتك محفوظة ومشفّرة محلياً على هذا الجهاز.
        </p>
      </div>
    </div>
  );
}

function AdminLogin() {
  const { state, actions } = useApp();
  const toast = useToast();
  const [email, setEmail] = useState(state.admin?.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSetup = !state.admin;
  const normalized = email.trim().toLowerCase();
  const needsVerify = !isSetup && !state.admin?.emailVerified;
  const inCodeStage = isSetup ? Boolean(sentCode) : needsVerify && state.pendingVerification?.email === normalized;
  const verified = !isSetup && Boolean(state.admin?.emailVerified);

  const finish = (value: string, googleLinked: boolean) => {
    actions.signIn({ role: 'admin', id: 'admin', name: value });
    toast(googleLinked ? 'تم الدخول عبر Google (محاكاة)' : 'أهلاً بك في لوحة المسؤول');
  };

  const sendCode = async () => {
    setError('');
    if (!/^[^\s@]+@gmail\.com$/i.test(normalized)) {
      return setError('استخدم بريد Gmail رسمياً بصيغة name@gmail.com');
    }
    setBusy(true);
    try {
      const generated = await actions.requestEmailVerification(normalized, isSetup ? 'setup' : 'reverify');
      setSentCode(generated);
      setCode('');
      toast(state.relay.mode === 'simulation' ? 'رمز الاختبار ظاهر أدناه' : 'أُرسل رمز التأكيد إلى بريدك');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (googleLinked: boolean) => {
    setError('');
    if (!code.trim()) return setError('أدخل رمز التأكيد');
    setBusy(true);
    try {
      await actions.completeAdminSetup(normalized, password.trim() || null, googleLinked, code);
      finish(normalized, googleLinked);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmExisting = async () => {
    setError('');
    if (!code.trim()) return setError('أدخل رمز التأكيد');
    setBusy(true);
    try {
      await actions.confirmAdminEmail(normalized, code);
      finish(normalized, false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setError('');
    if (normalized !== state.admin?.email) return setError('البريد غير مطابق للبريد الإداري المؤكَّد');
    if (state.admin?.passwordHash) {
      if (!password) return setError('أدخل كلمة المرور');
      setBusy(true);
      const ok = await actions.verifyAdminPassword(password);
      setBusy(false);
      if (!ok) return setError('كلمة المرور غير صحيحة');
    }
    finish(normalized, false);
  };

  return (
    <div className="card login-card">
      <div className="card-body stack">
        <Banner kind={verified ? 'info' : 'warning'}>
          {isSetup
            ? 'أول تشغيل: أدخل بريد Gmail الرسمي وأكّده برمز التحقق قبل إنشاء حساب المسؤول.'
            : needsVerify
              ? 'بريد هذا المسؤول غير مؤكَّد بعد. أكّده برمز التحقق للمتابعة.'
              : 'البريد الإداري الرسمي مؤكَّد ويُستخدم وجهةً للتقارير الأسبوعية وربط خدمات Google.'}
        </Banner>

        <div className="spread">
          <Field label="بريد Gmail الإداري الرسمي">
            <input
              className={`input${error && !normalized ? ' invalid' : ''}`}
              type="email"
              dir="ltr"
              placeholder="name@gmail.com"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setSentCode(null); }}
            />
          </Field>
          <span className={`badge ${verified ? 'badge-success' : 'badge-warning'}`} style={{ marginTop: 22 }}>
            {verified ? '✓ مؤكَّد' : 'بانتظار التأكيد'}
          </span>
        </div>

        {isSetup && (
          <Field label="كلمة المرور (اختياري)" hint="اتركها فارغة للدخول بالبريد المؤكَّد / Google فقط في هذه النسخة.">
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        )}

        {!isSetup && !needsVerify && state.admin?.passwordHash && (
          <Field label="كلمة المرور">
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        )}

        {inCodeStage && (
          <>
            {state.relay.mode === 'simulation' && sentCode && (
              <Banner kind="warning">
                وضع المحاكاة المحلي — رمز الاختبار: <strong dir="ltr">{sentCode}</strong> (صالح 10 دقائق، لا يُرسل بريد فعلي).
              </Banner>
            )}
            <Field label="رمز تأكيد البريد" hint="أدخل الرمز الذي أُرسل إلى بريد Gmail أو الظاهر في وضع المحاكاة.">
              <input
                className="input"
                dir="ltr"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void (isSetup ? confirmSetup(false) : confirmExisting())}
              />
            </Field>
          </>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        <div className="login-actions">
          {isSetup ? (
            inCodeStage ? (
              <button className="btn btn-primary" onClick={() => void confirmSetup(false)} disabled={busy}>
                تأكيد البريد وإنشاء الحساب
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void sendCode()} disabled={busy}>
                إرسال رمز تأكيد Gmail
              </button>
            )
          ) : needsVerify ? (
            inCodeStage ? (
              <button className="btn btn-primary" onClick={() => void confirmExisting()} disabled={busy}>
                تأكيد البريد والدخول
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void sendCode()} disabled={busy}>
                إرسال رمز تأكيد جديد
              </button>
            )
          ) : (
            <button className="btn btn-primary" onClick={() => void handleLogin()} disabled={busy}>
              دخول المسؤول
            </button>
          )}

          {inCodeStage && (
            <button className="btn btn-ghost btn-sm" onClick={() => void sendCode()} disabled={busy}>
              إعادة إرسال الرمز
            </button>
          )}

          <div className="divider-text">أو</div>
          <button
            className="btn btn-secondary"
            disabled={busy || (isSetup ? !inCodeStage : !verified)}
            onClick={() => void (isSetup ? confirmSetup(true) : Promise.resolve(finish(state.admin!.email, true)))}
          >
            <span aria-hidden="true">◎</span> المتابعة بحساب Google (محاكاة)
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffLogin() {
  const { state, actions } = useApp();
  const toast = useToast();
  const activeStaff = useMemo(() => state.staff.filter((member) => member.active), [state.staff]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setError('');
    const member = activeStaff.find((item) => item.name.trim() === name.trim());
    if (!member) return setError('الاسم غير موجود في الكادر الفعّال');
    if (!pin) return setError('أدخل الرمز السري');
    setBusy(true);
    const ok = await actions.verifyStaffPin(member.id, pin);
    setBusy(false);
    if (!ok) return setError('الرمز السري غير صحيح');
    actions.signIn({ role: 'staff', id: member.id, name: member.name });
    toast(`أهلاً ${member.name}`);
  };

  return (
    <div className="card login-card">
      <div className="card-body stack">
        {activeStaff.length === 0 ? (
          <Banner kind="warning">
            لم يُنشأ أي عضو كادر بعد. اطلب من المسؤول إضافة الأسماء والرموز من صفحة «إدارة الكادر».
          </Banner>
        ) : (
          <>
            <Banner kind="info">
              مسار الكادر: الاسم المسجّل + الرمز السري (PIN). الرموز محفوظة كتجزئة ولا تُرسل لأي خادم في هذه النسخة.
            </Banner>
            <Field label="اسمك في الكادر" hint="اختر الاسم المسجّل لك من القائمة.">
              <input
                className="input"
                list="staff-names"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="اكتب الاسم أو اختره"
              />
              <datalist id="staff-names">
                {activeStaff.map((member) => <option key={member.id} value={member.name} />)}
              </datalist>
            </Field>
            <Field label="الرمز السري (PIN / Code)">
              <input
                className="input"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void handleLogin()}
              />
            </Field>
            {error && <Banner kind="error">{error}</Banner>}
            <button className="btn btn-primary" onClick={handleLogin} disabled={busy}>
              دخول الكادر
            </button>
          </>
        )}
      </div>
    </div>
  );
}
