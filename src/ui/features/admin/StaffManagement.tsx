/**
 * إدارة الكادر — بلوك مستقل لكل وجبة يعرض: الترتيب، الاسم، الأعضاء،
 * رموزهم (مخفية افتراضياً)، وإضافة/نقل/تعديل/حذف العضو داخل الوجبة.
 * على الهواتف تتحوّل صفوف الجدول إلى بطاقات مكدّسة سهلة اللمس.
 */
import { useState } from 'react';
import type { StaffMember } from '@/domain/types';
import { sortedMeals, staffForMeal } from '@/domain/selectors';
import { generatePin } from '@/utils/id';
import { useApp } from '@/state/AppContext';
import { Banner, EmptyState, Field, Modal, useToast } from '@/ui/components/ui';
import { SheetsSyncPanel } from './SheetsSyncPanel';

interface FormState {
  name: string;
  pin: string;
  mealIds: string[];
  active: boolean;
}

export function StaffManagement() {
  const { state, actions } = useApp();
  const toast = useToast();
  const meals = sortedMeals(state);
  const [editing, setEditing] = useState<{ member?: StaffMember; mealId: string } | null>(null);

  const openAdd = (mealId: string) =>
    setEditing({ mealId, member: undefined });

  const openEdit = (member: StaffMember, mealId: string) =>
    setEditing({ mealId, member });

  const handleSave = async (form: FormState) => {
    if (!form.name.trim()) return toast('أدخل اسم العضو', 'error');
    if (!editing?.member && !form.pin.trim()) return toast('أدخل الرمز السري للعضو', 'error');
    if (form.mealIds.length === 0) return toast('اختر وجبة واحدة على الأقل', 'error');

    if (editing?.member) {
      await actions.updateStaff(editing.member.id, {
        name: form.name,
        mealIds: form.mealIds,
        active: form.active,
        ...(form.pin ? { pin: form.pin } : {}),
      });
      toast('تم تعديل بيانات العضو');
    } else {
      await actions.addStaff({ name: form.name, pin: form.pin, mealIds: form.mealIds });
      toast('تمت إضافة العضو إلى الكادر');
    }
    setEditing(null);
  };

  return (
    <div className="stack">
      <Banner kind="info">
        كل بلوك أدناه مستقل لوجبة واحدة. العضو قد يظهر في أكثر من بلوك إذا كان مربوطاً بأكثر من وجبة،
        وخيار «نقل إلى» يزيله من البلوك الحالي ويضيفه إلى الوجبة المختارة. الرموز مخفية افتراضياً.
      </Banner>

      <SheetsSyncPanel />

      {meals.length === 0 ? (
        <EmptyState
          title="لا توجد وجبات"
          description="أضف وجبات أولاً من صفحة «الوجبات» لتمكين تنظيم الكادر."
        />
      ) : meals.map((meal, index) => {
        const members = staffForMeal(state, meal.id);
        return (
          <section className="card meal-block" key={meal.id} aria-label={`بلوك وجبة ${meal.name}`}>
            <div className="meal-block-head">
              <span className="meal-order">{index + 1}</span>
              <div style={{ flex: 1 }}>
                <strong>{meal.name}</strong>
                <span className="small muted"> — {meal.label}</span>
              </div>
              <span className="badge">{members.length} عضو</span>
              <button className="btn btn-primary btn-sm" onClick={() => openAdd(meal.id)}>+ إضافة عضو</button>
            </div>

            {members.length === 0 ? (
              <div className="empty" style={{ padding: 'var(--s6)' }}>
                <p className="small" style={{ margin: 0 }}>لا يوجد أعضاء في هذه الوجبة بعد.</p>
              </div>
            ) : (
              <>
                {/* سطح المكتب: جدول مضغوط */}
                <div className="member-table-wrap">
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th>الاسم</th><th>الرمز السري</th><th>الوجبات المرتبطة</th><th>نقل إلى</th><th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td><MemberName member={member} /></td>
                          <td><PinControl staffId={member.id} /></td>
                          <td className="small muted"><LinkedMeals member={member} /></td>
                          <td><MoveSelect member={member} mealId={meal.id} /></td>
                          <td><MemberActions member={member} mealId={meal.id} onEdit={openEdit} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* الهاتف: بطاقات مكدّسة */}
                <div className="member-cards">
                  {members.map((member) => (
                    <div className="member-card" key={member.id}>
                      <div className="member-card-head"><MemberName member={member} /></div>
                      <div>
                        <div className="member-card-label">الرمز السري</div>
                        <PinControl staffId={member.id} />
                      </div>
                      <div>
                        <div className="member-card-label">الوجبات المرتبطة</div>
                        <span className="small muted"><LinkedMeals member={member} /></span>
                      </div>
                      <div>
                        <div className="member-card-label">نقل إلى</div>
                        <MoveSelect member={member} mealId={meal.id} />
                      </div>
                      <MemberActions member={member} mealId={meal.id} onEdit={openEdit} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        );
      })}

      {editing && (
        <StaffFormModal
          key={editing.member?.id ?? `new-${editing.mealId}`}
          member={editing.member}
          defaultMealId={editing.mealId}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function MemberName({ member }: { member: StaffMember }) {
  return (
    <>
      <strong>{member.name}</strong>
      {!member.active && <span className="badge badge-danger" style={{ marginInlineStart: 6 }}>غير فعّال</span>}
    </>
  );
}

function LinkedMeals({ member }: { member: StaffMember }) {
  const { state } = useApp();
  return <>{member.mealIds
    .map((id) => state.meals.find((item) => item.id === id)?.name ?? '?')
    .join('، ')}</>;
}

/** رمز مخفي افتراضياً مع إظهار/إخفاء ونسخ آمن. */
function PinControl({ staffId }: { staffId: string }) {
  const { actions } = useApp();
  const toast = useToast();
  const [pin, setPin] = useState<string | null>(null); // null = لم يُفكّ بعد / مخفي
  const [visible, setVisible] = useState(false);

  const ensurePin = async (): Promise<string> => {
    if (pin !== null) return pin;
    const value = await actions.revealStaffPin(staffId);
    setPin(value);
    return value;
  };

  const toggle = async () => {
    if (visible) {
      setVisible(false);
      setPin(null);
      return;
    }
    await ensurePin();
    setVisible(true);
  };

  const copy = async () => {
    const value = await ensurePin();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // توافق مع المتصفحات/السياقات غير الآمنة
        const helper = document.createElement('textarea');
        helper.value = value;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      toast('تم نسخ الرمز السري');
    } catch {
      toast('تعذّر نسخ الرمز، استخدم زر الإظهار', 'error');
    }
  };

  return (
    <div className="pin-control">
      <code className="pin-code" dir="ltr">{visible && pin !== null ? pin : '••••••'}</code>
      <button className="btn btn-secondary btn-sm" onClick={() => void toggle()} aria-label={visible ? 'إخفاء الرمز' : 'إظهار الرمز'}>
        {visible ? 'إخفاء' : 'إظهار'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => void copy()} aria-label="نسخ الرمز">نسخ</button>
    </div>
  );
}

function MoveSelect({ member, mealId }: { member: StaffMember; mealId: string }) {
  const { state, actions } = useApp();
  const toast = useToast();
  const meals = sortedMeals(state);
  return (
    <select
      className="select"
      value={mealId}
      aria-label={`نقل ${member.name} من ${state.meals.find((item) => item.id === mealId)?.name ?? ''}`}
      onChange={(event) => {
        const target = event.target.value;
        if (target === '__remove__') {
          void actions.updateStaff(member.id, {
            mealIds: member.mealIds.filter((id) => id !== mealId),
          });
        } else {
          void actions.moveStaff(member.id, mealId, target);
        }
        toast('تم تحديث ارتباط العضو بالوجبات');
      }}
    >
      <option value={mealId}>في هذه الوجبة</option>
      {meals.filter((item) => item.id !== mealId).map((item) => (
        <option key={item.id} value={item.id}>نقل إلى {item.name}</option>
      ))}
      <option value="__remove__">إزالة من هذه الوجبة</option>
    </select>
  );
}

function MemberActions({
  member,
  mealId,
  onEdit,
}: {
  member: StaffMember;
  mealId: string;
  onEdit: (member: StaffMember, mealId: string) => void;
}) {
  const { actions } = useApp();
  return (
    <div className="row member-card-actions" style={{ gap: 6 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => onEdit(member, mealId)}>تعديل</button>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => {
          if (window.confirm(`حذف العضو «${member.name}» من الكادر؟`)) {
            void actions.removeStaff(member.id);
          }
        }}
      >حذف</button>
    </div>
  );
}

function StaffFormModal({
  member,
  defaultMealId,
  onClose,
  onSave,
}: {
  member?: StaffMember;
  defaultMealId: string;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
}) {
  const { state } = useApp();
  const [form, setForm] = useState<FormState>({
    name: member?.name ?? '',
    pin: member ? '' : generatePin(), // رمز عشوائي جاهز للأعضاء الجدد
    mealIds: member?.mealIds ?? [defaultMealId],
    active: member?.active ?? true,
  });
  const [busy, setBusy] = useState(false);

  const toggleMeal = (id: string) => {
    setForm((current) => ({
      ...current,
      mealIds: current.mealIds.includes(id)
        ? current.mealIds.filter((value) => value !== id)
        : [...current.mealIds, id],
    }));
  };

  const submit = async () => {
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      title={member ? `تعديل: ${member.name}` : 'إضافة عضو جديد'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>حفظ</button>
        <button className="btn btn-secondary" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="stack">
        <Field label="اسم العضو">
          <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field
          label={member ? 'رمز جديد (اتركه فارغاً للاحتفاظ بالحالي)' : 'الرمز السري (PIN / Code)'}
          hint="يُنشأ رمز عشوائي تلقائياً؛ يمكنك تغييره أو توليد غيره بضغطة زر."
        >
          <div className="row">
            <input
              className="input"
              dir="ltr"
              style={{ flex: 1, minWidth: 140 }}
              value={form.pin}
              onChange={(event) => setForm({ ...form, pin: event.target.value })}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => setForm((current) => ({ ...current, pin: generatePin() }))}>
              توليد رمز
            </button>
          </div>
        </Field>
        <div className="field">
          <span className="form-label">الوجبات المرتبطة</span>
          <div className="row">
            {sortedMeals(state).map((meal) => (
              <label className="checkbox" key={meal.id}>
                <input type="checkbox" checked={form.mealIds.includes(meal.id)} onChange={() => toggleMeal(meal.id)} />
                {meal.name}
              </label>
            ))}
          </div>
        </div>
        {member && (
          <label className="checkbox">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            عضو فعّال (يمكنه الدخول)
          </label>
        )}
      </div>
    </Modal>
  );
}
