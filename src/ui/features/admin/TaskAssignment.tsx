/** إسناد المهام للوجبات + تحديد جدول مناوبة اليوم لمعرفة الوجبة العاملة تلقائياً. */
import { useState } from 'react';
import type { TaskPriority } from '@/domain/types';
import { scheduleForDate, sortedMeals, sortedTasks } from '@/domain/selectors';
import { formatDateAr, formatTime, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Banner, EmptyState, Field, useToast } from '@/ui/components/ui';

export function TaskAssignment() {
  const { state, actions, currentUser } = useApp();
  const toast = useToast();
  const meals = sortedMeals(state);
  const today = todayKey();
  const working = scheduleForDate(state, today);

  const [scheduleMeal, setScheduleMeal] = useState(working?.mealId ?? meals[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [useWorking, setUseWorking] = useState(Boolean(working));
  const [targetMeal, setTargetMeal] = useState(working?.mealId ?? meals[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const effectiveMeal = useWorking ? (working?.mealId ?? scheduleMeal) : targetMeal;
  const activeTasks = sortedTasks(state).filter((task) => task.date === today && task.status === 'new');

  const saveSchedule = async () => {
    if (!scheduleMeal) return toast('اختر وجبة لجدول اليوم', 'error');
    await actions.setDaySchedule(today, scheduleMeal);
    toast('تم حفظ جدول مناوبة اليوم');
  };

  const sendTask = async () => {
    if (!title.trim()) return toast('اكتب عنوان المهمة أولاً', 'error');
    if (!effectiveMeal) return toast('حدّد الوجبة المستهدفة أو احفظ جدول اليوم', 'error');
    setBusy(true);
    try {
      await actions.assignTask({
        title,
        details,
        priority,
        mealId: effectiveMeal,
        createdBy: currentUser?.name ?? 'المسؤول',
      });
      setTitle('');
      setDetails('');
      setPriority('normal');
      toast('تم إرسال المهمة وسيظهر تنبيه لأعضاء الوجبة فور المزامنة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Banner kind="info">
        تُرسل المهام عبر وسيط Google Apps Script (أو المحاكاة محلياً). عند دخول أعضاء الوجبة المستهدفة يظهر لهم تنبيه
        «لديكم مهمة جديدة من المسؤول»، ويمكنهم الإتمام أو التأجيل مع تسجيل ذلك تلقائياً في السجل اليومي.
      </Banner>

      <div className="card card-pad stack">
        <div>
          <h2 style={{ margin: 0 }}>جدول مناوبة اليوم</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {formatDateAr(today)} — حدد الوجبة العاملة لتستخدمها المهام تلقائياً.
          </p>
        </div>
        <div className="row">
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label className="form-label">الوجبة العاملة</label>
            <select className="select" value={scheduleMeal} onChange={(event) => setScheduleMeal(event.target.value)}>
              {meals.map((meal) => (
                <option key={meal.id} value={meal.id}>{meal.name} — {meal.label}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => void saveSchedule()} disabled={!scheduleMeal}>
            حفظ جدول اليوم
          </button>
        </div>
        {working && (
          <div className="badge badge-success" style={{ alignSelf: 'flex-start' }}>
            ✓ وجبة اليوم الحالية: {working.mealName}
          </div>
        )}
      </div>

      <div className="card card-pad stack">
        <h2 style={{ margin: 0 }}>إسناد مهمة جديدة</h2>
        <Field label="عنوان المهمة">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: مراجعة عدادات الوجبة" />
        </Field>
        <Field label="تفاصيل المهمة">
          <textarea className="textarea" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="خطوات أو ملاحظات للفريق…" />
        </Field>
        <div className="grid grid-2">
          <Field label="مستوى الأهمية">
            <select className="select" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="normal">عادية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </Field>
          <Field label="الوجبة المستهدفة">
            <select
              className="select"
              value={useWorking ? (working?.mealId ?? scheduleMeal) : targetMeal}
              onChange={(event) => { setTargetMeal(event.target.value); setUseWorking(false); }}
              disabled={useWorking}
            >
              {meals.map((meal) => (
                <option key={meal.id} value={meal.id}>{meal.name} — {meal.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={useWorking} onChange={(event) => setUseWorking(event.target.checked)} />
          إرسال إلى الوجبة العاملة اليوم من الجدول
        </label>
        <div>
          <button className="btn btn-primary" onClick={() => void sendTask()} disabled={busy}>
            {busy ? 'جارٍ الإرسال…' : 'إرسال المهمة للوجبة'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>المهام النشطة اليوم</h2><span className="badge">{activeTasks.length}</span></div>
        <div className="card-body">
          {activeTasks.length === 0 ? (
            <EmptyState title="لا توجد مهام نشطة" description="أرسل مهمة جديدة من النموذج أعلاه لتظهر هنا ولدى الوجبة المستهدفة." glyph="✅" />
          ) : (
            <div className="task-list">
              {activeTasks.map((task) => (
                <div className="task-item" key={task.id}>
                  <div className="task-item-head">
                    <strong>{task.title}</strong>
                    <span className={`badge ${task.priority === 'urgent' ? 'badge-danger' : 'badge-accent'}`}>
                      {task.priority === 'urgent' ? 'عاجلة' : 'عادية'}
                    </span>
                  </div>
                  {task.details && <p className="small" style={{ margin: '6px 0' }}>{task.details}</p>}
                  <div className="tiny muted">
                    {task.mealName} · {task.createdBy} · {formatTime(task.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
