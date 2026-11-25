/** متابعة المهام المؤجلة، اعتماد السجل، التنبيه العام، وتصدير PDF. */
import { useState } from 'react';
import { approvalForDate, reportsForDate, reportsInRange, sortedMeals, sortedTasks } from '@/domain/selectors';
import { formatDateAr, formatDateTimeAr, shiftDateKey, todayKey } from '@/utils/date';
import { exportReportsPdf } from '@/utils/pdf';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';

type Range = 'daily' | 'weekly' | 'custom';

export function AdminControls() {
  const { state, actions, currentUser } = useApp();
  const toast = useToast();
  const today = todayKey();
  const meals = sortedMeals(state);
  const deferred = sortedTasks(state).filter((task) => task.status === 'postponed');
  const approval = approvalForDate(state, today);
  const todayReports = reportsForDate(state, today);
  const sequenceComplete = meals.length > 0 && meals.every((meal) => todayReports.some((report) => report.mealId === meal.id));

  const [reassignMeal, setReassignMeal] = useState<Record<string, string>>({});
  const [broadcast, setBroadcast] = useState('');
  const [busyBroadcast, setBusyBroadcast] = useState(false);
  const [range, setRange] = useState<Range>('daily');
  const [from, setFrom] = useState(shiftDateKey(today, -6));
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);

  const rangeBounds = (): { from: string; to: string; label: string } => {
    if (range === 'daily') return { from: today, to: today, label: `تقرير يومي — ${formatDateAr(today)}` };
    if (range === 'weekly') {
      const start = shiftDateKey(today, -6);
      return { from: start, to: today, label: `تقرير أسبوعي — ${formatDateAr(start)} إلى ${formatDateAr(today)}` };
    }
    return { from, to, label: `تقرير مخصص — ${formatDateAr(from)} إلى ${formatDateAr(to)}` };
  };

  const downloadPdf = async () => {
    const bounds = rangeBounds();
    if (bounds.from > bounds.to) return toast('تاريخ البداية يجب أن يكون قبل النهاية', 'error');
    setExporting(true);
    try {
      await exportReportsPdf({
        title: 'السجل اليومي المتتابع',
        rangeLabel: bounds.label,
        fileName: `${bounds.from}_${bounds.to}`,
        reports: reportsInRange(state, bounds.from, bounds.to),
        tasks: sortedTasks(state).filter((task) => task.date >= bounds.from && task.date <= bounds.to),
        dayLogs: state.dayLogs.filter((day) => day.date >= bounds.from && day.date <= bounds.to),
        staff: state.staff,
        approvals: state.approvals.filter((item) => item.date >= bounds.from && item.date <= bounds.to),
      });
      toast('تم تحميل ملف PDF بصياغة عربية RTL');
    } catch (error) {
      console.error(error);
      toast('تعذّر إنشاء PDF، حاول مرة أخرى', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>متابعة المهام المؤجلة</h2>
          <span className="badge badge-warning">{deferred.length} مهمة</span>
        </div>
        <div className="card-body">
          {deferred.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>لا توجد مهام مؤجلة حالياً.</p>
          ) : (
            <div className="task-list">
              {deferred.map((task) => (
                <div className="task-item" key={task.id}>
                  <div className="task-item-head">
                    <strong>{task.title}</strong>
                    <span className="badge badge-warning">مؤجلة</span>
                  </div>
                  <p className="small" style={{ margin: '6px 0' }}>السبب: {task.postponedReason}</p>
                  <div className="tiny muted">
                    {task.mealName} · {task.postponedBy ?? '—'} · {task.postponedAt ? formatDateTimeAr(task.postponedAt) : ''}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <select
                      className="select"
                      aria-label={`إعادة توجيه ${task.title}`}
                      value={reassignMeal[task.id] ?? meals.find((meal) => meal.id !== task.mealId)?.id ?? ''}
                      onChange={(event) => setReassignMeal((current) => ({ ...current, [task.id]: event.target.value }))}
                    >
                      {meals.map((meal) => <option key={meal.id} value={meal.id}>إلى {meal.name}</option>)}
                    </select>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const target = reassignMeal[task.id] ?? meals.find((meal) => meal.id !== task.mealId)?.id;
                        if (!target) return;
                        void actions.reassignTask(task.id, target).then(() => toast('تمت إعادة توجيه المهمة للوجبة الجديدة'));
                      }}
                    >إعادة توجيه</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad stack">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>اعتماد السجل اليومي</h2>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{formatDateAr(today)}</p>
          </div>
          {approval && <span className="badge badge-success">✓ معتمد من المسؤول · {approval.approvedBy}</span>}
        </div>
        {!sequenceComplete && (
          <Banner kind="warning">
            اكتمال تتابع الوجبات مطلوب قبل الاعتماد: {todayReports.length} تقرير من أصل {meals.length} وجبة.
          </Banner>
        )}
        <div>
          <button
            className="btn btn-primary"
            disabled={!sequenceComplete || Boolean(approval)}
            onClick={() => {
              void actions.approveDay(today, currentUser?.name ?? 'المسؤول')
                .then(() => toast('تم ختم سجل اليوم باعتماد المسؤول'))
                .catch((error: Error) => toast(error.message, 'error'));
            }}
          >
            {approval ? 'السجل معتمد بالفعل' : 'اعتماد سجل اليوم'}
          </button>
        </div>
      </div>

      <div className="card card-pad stack">
        <h2 style={{ margin: 0 }}>تعميم إداري عاجل (Broadcast)</h2>
        <Field label="نص التنبيه" hint="يظهر أعلى شاشة جميع المستخدمين فور المزامنة ويمكن إزالته من هنا.">
          <textarea
            className="textarea"
            value={broadcast}
            onChange={(event) => setBroadcast(event.target.value)}
            placeholder="مثال: اجتماع عاجل للوجبة B بعد انتهاء المناوبة"
          />
        </Field>
        <div className="row">
          <button
            className="btn btn-danger"
            disabled={!broadcast.trim() || busyBroadcast}
            onClick={() => {
              setBusyBroadcast(true);
              void actions.publishBroadcast(broadcast, currentUser?.name ?? 'المسؤول')
                .then(() => { toast('تم نشر التنبيه العام'); setBroadcast(''); })
                .finally(() => setBusyBroadcast(false));
            }}
          >نشر التنبيه</button>
          {state.broadcast && (
            <button className="btn btn-secondary" onClick={() => {
              void actions.clearBroadcast(currentUser?.name ?? 'المسؤول').then(() => toast('تمت إزالة التنبيه'));
            }}>إزالة التنبيه الحالي</button>
          )}
        </div>
        {state.broadcast && (
          <Banner kind="error">التنبيه المنشور حالياً: {state.broadcast.message}</Banner>
        )}
      </div>

      <div className="card card-pad stack">
        <h2 style={{ margin: 0 }}>تصدير وتحميل السجل PDF</h2>
        <p className="small muted" style={{ margin: 0 }}>
          دفتر رسمي عربي RTL: رأس التاريخ، الحضور والمجازين، الأعمال اليومية والمهام المطلوبة مرقّمة، ثم الأعمال المؤجلة. التعليقات الجانبية مستبعدة تماماً.
        </p>
        <div className="row">
          <div className="field" style={{ minWidth: 170 }}>
            <label className="form-label">النطاق الزمني</label>
            <select className="select" value={range} onChange={(event) => setRange(event.target.value as Range)}>
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
              <option value="custom">مخصص</option>
            </select>
          </div>
          {range === 'custom' && (
            <>
              <div className="field" style={{ minWidth: 150 }}>
                <label className="form-label">من</label>
                <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 150 }}>
                <label className="form-label">إلى</label>
                <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </>
          )}
        </div>
        <div>
          <button className="btn btn-primary" onClick={() => void downloadPdf()} disabled={exporting}>
            {exporting ? 'جارٍ تجهيز الملف…' : 'تحميل PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
