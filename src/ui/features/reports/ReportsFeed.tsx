/** السجل اليومي الموحّد: بطاقة واحدة لليوم والوجبة المناوبة، مع قفل كتابة وتعليقات جانبية. */
import { useEffect, useState } from 'react';
import type { Report } from '@/domain/types';
import {
  attachmentsForReport,
  availableDates,
  canWriteLog,
  commentsForDate,
  dailyWorkItems,
  dayLogForDate,
  postponedWorkItems,
  reportsForDate,
  scheduleForDate,
  staffForMeal,
} from '@/domain/selectors';
import { formatDateAr, formatDateNumeric, formatDateTimeAr, formatTime, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Banner, EmptyState, Field, Modal, useToast } from '@/ui/components/ui';
import { usePreview } from '@/ui/features/media/PreviewContext';
import { QuickReportModal } from './QuickReportModal';

/** مؤشر تسلسل الوجبات داخل السجل الموحّد. */
export function MealSequenceStrip({ date, reports }: { date: string; reports: Report[] }) {
  const { state } = useApp();
  const meals = [...state.meals].sort((a, b) => a.order - b.order);
  const doneIds = new Set(reports.map((report) => report.mealId));
  const nextId = meals.find((meal) => !doneIds.has(meal.id))?.id;

  return (
    <div className="sequence-strip" aria-label={`تتابع وجبات ${formatDateAr(date)}`}>
      <strong className="tiny muted">تتابع اليوم:</strong>
      {meals.map((meal, index) => {
        const count = reports.filter((report) => report.mealId === meal.id).length;
        const status = count > 0 ? 'done' : meal.id === nextId ? 'next' : '';
        return (
          <span key={meal.id} className="row" style={{ gap: 6 }}>
            {index > 0 && <span className="sequence-arrow" aria-hidden="true">←</span>}
            <span className={`sequence-chip ${status}`}>
              {count > 0 ? '✓' : meal.id === nextId ? '◌' : '·'} {meal.name}
              {count > 1 ? ` ×${count}` : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ReportsFeed() {
  const { state, currentUser, actions } = useApp();
  const toast = useToast();
  const { open } = usePreview();
  const dates = [...new Set([
    ...availableDates(state),
    ...state.dayLogs.map((day) => day.date),
    ...state.tasks.map((task) => task.date),
  ])].sort((a, b) => b.localeCompare(a));
  const [selected, setSelected] = useState(todayKey());
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const activeDate = dates.includes(selected) ? selected : (dates[0] ?? selected);
  const schedule = scheduleForDate(state, activeDate);
  const dayLog = dayLogForDate(state, activeDate);
  const reports = reportsForDate(state, activeDate);
  const work = dailyWorkItems(state, activeDate);
  const postponed = postponedWorkItems(state, activeDate);
  const comments = commentsForDate(state, activeDate);
  const approval = state.approvals.find((item) => item.date === activeDate);
  const members = schedule ? staffForMeal(state, schedule.mealId) : [];
  const canWrite = canWriteLog(state, currentUser, activeDate);
  const canEditHeader = currentUser?.role === 'admin' || canWrite;

  const [attendance, setAttendance] = useState<string[]>(dayLog?.attendance ?? []);
  const [leave, setLeave] = useState<string[]>(dayLog?.leave ?? []);
  useEffect(() => {
    setAttendance(dayLog?.attendance ?? []);
    setLeave(dayLog?.leave ?? []);
  }, [activeDate, dayLog?.updatedAt]);

  const toggleMember = (id: string, group: 'attendance' | 'leave') => {
    if (group === 'attendance') {
      setLeave((current) => current.filter((item) => item !== id));
      setAttendance((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    } else {
      setAttendance((current) => current.filter((item) => item !== id));
      setLeave((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    }
  };

  const saveHeader = async () => {
    if (!currentUser) return;
    setBusy(true);
    try {
      await actions.setDayLog(activeDate, { attendance, leave }, currentUser);
      toast('تم حفظ الحضور والمجازين في سجل اليوم');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!currentUser || !comment.trim()) return;
    setBusy(true);
    try {
      await actions.addComment(activeDate, comment, currentUser);
      setComment('');
      toast('أُضيف التعليق الجانبي (لا يظهر في PDF)');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing?.content.trim() || !currentUser) return;
    setBusy(true);
    try {
      await actions.updateReport(editing.id, editing.content, currentUser);
      setEditing(null);
      toast('تم تعديل السجل');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="spread" style={{ gap: 'var(--s3)' }}>
        <p className="small muted" style={{ margin: 0 }}>
          سجل واحد لكل يوم ووجبة مناوبة. يقرأه الجميع، وتكتبه فقط وجبة اليوم المناوبة طوال فترة دوامها.
        </p>
        <div className="row">
          <span className={`badge ${canWrite ? 'badge-success' : 'badge-warning'}`}>
            {canWrite ? '✎ قابل للكتابة' : '👁 للقراءة فقط'}
          </span>
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>+ إضافة تقرير / مرفق</button>
          )}
        </div>
      </div>

      {dates.length > 0 && (
        <div className="date-pills" role="tablist" aria-label="اختر اليوم">
          {dates.map((date) => (
            <button
              key={date}
              className={`btn btn-sm ${date === activeDate ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelected(date)}
              role="tab"
              aria-selected={date === activeDate}
            >
              {formatDateAr(date)}
            </button>
          ))}
        </div>
      )}

      <div className="card daily-log" aria-label={`سجل يوم ${formatDateAr(activeDate)}`}>
        <div className="daily-log-head">
          <div className="day-date-box">التاريخ: {formatDateNumeric(activeDate)}</div>
          <div className="tiny muted">
            الوجبة المناوبة: <strong>{schedule?.mealName ?? 'لم يُحدد جدول اليوم'}</strong>
            {dayLog && <> · آخر تحديث: {formatDateTimeAr(dayLog.updatedAt)} بواسطة {dayLog.updatedBy}</>}
          </div>
          {schedule ? <MealSequenceStrip date={activeDate} reports={reports} /> : (
            <Banner kind="warning">لم يُحدد جدول مناوبة لهذا اليوم بعد؛ لا يمكن الكتابة في السجل قبل تحديده.</Banner>
          )}
          {approval && (
            <div className="banner banner-success">✓ معتمد من المسؤول — {approval.approvedBy} · {formatDateTimeAr(approval.approvedAt)}</div>
          )}
        </div>

        <div className="card-body stack">
          {schedule ? (
            <div className="attendance-grid">
              <div className="attendance-col">
                <strong>الحضور</strong>
                {members.length === 0 ? <p className="tiny muted">لا يوجد أعضاء في الوجبة المناوبة.</p> : (
                  <div className="member-checks">
                    {members.map((member) => (
                      <label className="checkbox" key={`att-${member.id}`}>
                        <input
                          type="checkbox"
                          checked={attendance.includes(member.id)}
                          disabled={!canEditHeader}
                          onChange={() => toggleMember(member.id, 'attendance')}
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="attendance-col">
                <strong>المجازين</strong>
                {members.length === 0 ? <p className="tiny muted">—</p> : (
                  <div className="member-checks">
                    {members.map((member) => (
                      <label className="checkbox" key={`leave-${member.id}`}>
                        <input
                          type="checkbox"
                          checked={leave.includes(member.id)}
                          disabled={!canEditHeader}
                          onChange={() => toggleMember(member.id, 'leave')}
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {canEditHeader && (
                <div className="attendance-actions">
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void saveHeader()}>
                    حفظ الحضور والمجازين
                  </button>
                </div>
              )}
            </div>
          ) : <Banner kind="info">رأس السجل (الحضور والمجازين) يظهر بعد حفظ جدول المناوبة من إدارة المسؤول.</Banner>}

          <div className="divider" />

          <section className="log-section">
            <h2>الأعمال اليومية والمهام المطلوبة</h2>
            {work.length === 0 ? (
              <EmptyState
                glyph="🗓"
                title="لا توجد أعمال مسجلة لهذا اليوم بعد"
                description={canWrite ? 'أضف أول تقرير أو أنجز مهمة مسندة لتظهر هنا مرتّبة في سطر واحد.' : 'سيظهر السجل فور كتابة الوجبة المناوبة له.'}
              />
            ) : (
              <ol className="daily-work">
                {work.map((item) => {
                  const report = item.kind === 'report'
                    ? state.reports.find((candidate) => candidate.id === item.id)
                    : undefined;
                  const attachments = report ? attachmentsForReport(state, report.id) : [];
                  const editable = canWrite && Boolean(schedule && report?.mealId === schedule.mealId);
                  return (
                    <li key={item.id}>
                      <div className="work-line">
                        <span>{item.text}</span>
                        {item.stamp && <span className="stamp-done">{item.stamp}</span>}
                        <span className="tiny muted">— {item.authorName} · {formatTime(item.createdAt)}</span>
                        {editable && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing({ id: item.id, content: report!.content })}
                          >تعديل</button>
                        )}
                      </div>
                      {attachments.length > 0 && (
                        <div className="attachment-chips">
                          {attachments.map((attachment) => (
                            <button key={attachment.id} className="chip" onClick={() => open(attachment)}>
                              <span aria-hidden="true">{attachment.kind === 'image' ? '🖼' : attachment.kind === 'pdf' ? '📕' : '📄'}</span>
                              {attachment.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="log-section">
            <h2>الأعمال المؤجلة - إن وجد</h2>
            {postponed.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>لا توجد أعمال مؤجلة.</p>
            ) : (
              <ul className="deferred-list">
                {postponed.map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong> — السبب: {task.postponedReason}
                    <span className="tiny muted"> · {task.postponedBy ?? '—'} · {task.mealName}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card card-pad stack side-comments" data-print="false" aria-label="التعليقات الجانبية">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>التعليقات / الملاحظات الجانبية</h2>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              لأي عضو أو مسؤول إضافة استفسار أو تنبيه دون المساس بنص السجل الرسمي. لا تظهر هذه التعليقات في PDF أو الطباعة.
            </p>
          </div>
          <span className="badge badge-accent">{comments.length}</span>
        </div>
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="اكتب تعليقاً جانبياً أو استفساراً…"
          />
          <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()} onClick={() => void submitComment()}>
            إضافة تعليق
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>لا توجد تعليقات بعد.</p>
        ) : (
          <div className="comment-list">
            {comments.map((item) => (
              <div className="comment-item" key={item.id}>
                <div className="spread">
                  <strong className="small">{item.authorName}</strong>
                  <div className="row">
                    <span className="tiny muted">{formatDateTimeAr(item.createdAt)}</span>
                    {currentUser && (currentUser.role === 'admin' || currentUser.id === item.authorId) && (
                      <button
                        className="icon-btn"
                        aria-label="حذف التعليق"
                        onClick={() => void actions.removeComment(item.id, currentUser)}
                      >×</button>
                    )}
                  </div>
                </div>
                <p className="small" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{item.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {adding && <QuickReportModal onClose={() => setAdding(false)} />}
      {editing && (
        <Modal
          title="تعديل سجل اليوم"
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
            <button className="btn btn-primary" disabled={busy || !editing.content.trim()} onClick={() => void saveEdit()}>
              حفظ التعديل
            </button>
          </>}
        >
          <Field label="نص التقرير" hint="يُعدَّل السجل الرسمي فقط؛ التعليقات الجانبية منفصلة.">
            <textarea
              className="textarea"
              autoFocus
              value={editing.content}
              onChange={(event) => setEditing({ ...editing, content: event.target.value })}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
