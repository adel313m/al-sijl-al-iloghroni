/** مهام الوجبة: تنبيه فوري + إتمام/تأجيل مع تسجيل تلقائي في السجل اليومي. */
import { useState } from 'react';
import { newTasksForMeals, postponedForMeals, scheduleForDate, sortedMeals } from '@/domain/selectors';
import { formatDateTimeAr, formatTime, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Banner, EmptyState, Field, Modal, useToast } from '@/ui/components/ui';

function useStaffTasks() {
  const { state, currentUser } = useApp();
  const member = state.staff.find((item) => item.id === currentUser?.id);
  const date = todayKey();
  const schedule = scheduleForDate(state, date);
  // لا تُعرض إلا مهام الوجبة المناوبة اليوم؛ بقية الوجبات لا تملك صلاحية الكتابة.
  const mealIds = (member?.mealIds ?? []).filter((id) => id === schedule?.mealId);
  return {
    state,
    currentUser,
    mealIds,
    incoming: newTasksForMeals(state, mealIds, date),
    postponed: postponedForMeals(state, mealIds, date),
  };
}

/** شريط تنبيه يظهر أعلى لوحة الكادر فور الدخول إذا وُجدت مهام جديدة. */
export function StaffTaskAlert() {
  const { incoming } = useStaffTasks();
  if (incoming.length === 0) return null;
  const urgent = incoming.some((task) => task.priority === 'urgent');
  return (
    <Banner kind={urgent ? 'error' : 'warning'}>
      <strong>لديكم مهمة جديدة من المسؤول</strong> — {incoming.length} مهمة بانتظار الإتمام أو التأجيل.
      افتحوا «مهام الوجبة» من القائمة للتفاصيل.
    </Banner>
  );
}

export function TaskPanel() {
  const { state, currentUser, mealIds, incoming, postponed } = useStaffTasks();
  const { actions } = useApp();
  const toast = useToast();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const complete = async (taskId: string, title: string) => {
    if (!currentUser) return;
    setBusy(true);
    try {
      await actions.completeTask(taskId, currentUser.id, currentUser.name);
      toast(`تم الإنجاز + ${currentUser.name} — أُضيفت «${title}» إلى الأعمال اليومية`);
    } finally {
      setBusy(false);
    }
  };

  const submitPostpone = async () => {
    if (!currentUser || !reasonFor || !reason.trim()) return;
    setBusy(true);
    try {
      await actions.postponeTask(reasonFor, currentUser.id, currentUser.name, reason);
      toast('تم تأجيل المهمة وتسجيل السبب في السجل اليومي');
      setReasonFor(null);
      setReason('');
    } finally {
      setBusy(false);
    }
  };

  if (mealIds.length === 0) {
    return (
      <EmptyState
        title="لا توجد وجبة مسندة إليك"
        description="اطلب من المسؤول إضافتك إلى إحدى الوجبات لاستقبال المهام والتنبيهات."
        glyph="◉"
      />
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>المهام الواردة من المسؤول</h2>
          <span className="badge badge-accent">{incoming.length} مهمة</span>
        </div>
        <div className="card-body">
          {incoming.length === 0 ? (
            <EmptyState title="لا مهام حالياً" description="ستظهر المهام الجديدة هنا فور إرسال المسؤول لها." glyph="✅" />
          ) : (
            <div className="task-list">
              {incoming.map((task) => (
                <article className={`task-item${task.priority === 'urgent' ? ' task-urgent' : ''}`} key={task.id}>
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
                  <div className="row task-actions">
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void complete(task.id, task.title)}>
                      تم إتمام المهمة
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setReasonFor(task.id); setReason(''); }}>
                      تم تأجيلها
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {postponed.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>مهام مؤجلة من الوجبة السابقة</h2>
            <span className="badge badge-warning">{postponed.length}</span>
          </div>
          <div className="card-body">
            <div className="task-list">
              {postponed.map((task) => (
                <article className="task-item task-postponed" key={task.id}>
                  <div className="task-item-head">
                    <strong>{task.title}</strong>
                    <span className="badge badge-warning">مؤجلة</span>
                  </div>
                  <p className="small" style={{ margin: '6px 0' }}>سبب التأجيل: {task.postponedReason}</p>
                  <div className="tiny muted">
                    من {task.mealName} · {task.postponedBy ?? '—'} · {task.postponedAt ? formatDateTimeAr(task.postponedAt) : ''}
                  </div>
                  <div className="row task-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => {
                        const target = mealIds[0] ?? sortedMeals(state)[0]?.id;
                        if (target) void actions.reassignTask(task.id, target).then(() => toast('تم تولّي المهمة في وجبتك'));
                      }}
                    >تولّي المهمة في وجبتي</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {reasonFor && (
        <Modal
          title="سبب تأجيل المهمة"
          onClose={() => setReasonFor(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setReasonFor(null)}>إلغاء</button>
              <button className="btn btn-primary" disabled={!reason.trim() || busy} onClick={() => void submitPostpone()}>
                تأكيد التأجيل
              </button>
            </>
          }
        >
          <Field label="سبب مختصر" hint="سيظهر السبب للمسؤول وللوجبة التالية في التتابع ضمن السجل اليومي.">
            <textarea
              className="textarea"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثال: بانتظار توريد العدة"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
