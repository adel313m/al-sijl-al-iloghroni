/** كتابة التقرير اليومي مع إرفاق نصوص وصور وملفات PDF. */
import { useMemo, useRef, useState } from 'react';
import { scheduleForDate } from '@/domain/selectors';
import { formatDateAr, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Banner, Field, useToast } from '@/ui/components/ui';
import { usePendingAttachments } from '@/ui/features/reports/usePendingAttachments';

export function ReportComposer() {
  const { state, currentUser, actions } = useApp();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const assignedIds = useMemo(
    () => state.staff.find((member) => member.id === currentUser?.id)?.mealIds ?? [],
    [state.staff, currentUser?.id],
  );
  const schedule = scheduleForDate(state, todayKey());
  // الكتابة محصورة بالوجبة المناوبة في جدول اليوم، حتى لو كان العضو مسنداً لوجبات أخرى.
  const myMeals = state.meals.filter((meal) => meal.id === schedule?.mealId && assignedIds.includes(meal.id));

  const [mealId, setMealId] = useState(myMeals[0]?.id ?? '');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const { pending, addFiles, addNote, remove, clear } = usePendingAttachments();

  const activeMealId = myMeals.some((meal) => meal.id === mealId) ? mealId : (myMeals[0]?.id ?? '');

  const handleNote = () => {
    if (addNote(note)) {
      setNote('');
      toast('تمت إضافة النص كمرفق');
    }
  };

  const submit = async () => {
    if (!activeMealId || !currentUser) return toast('ليست وجبتك المناوبة اليوم؛ السجل مغلق للكتابة', 'error');
    if (!content.trim()) return toast('اكتب محتوى التقرير أولاً', 'error');
    setBusy(true);
    setSuccess('');
    try {
      const report = await actions.addReport({
        authorId: currentUser!.id,
        authorName: currentUser!.name,
        mealId: activeMealId,
        content,
      }, currentUser);
      for (const item of pending) {
        await actions.addAttachment({ ...item, mealId: activeMealId, reportId: report.id }, currentUser);
      }
      setContent('');
      clear();
      const mealName = state.meals.find((meal) => meal.id === activeMealId)?.name ?? '';
      setSuccess(`تم تسجيل تقريرك في سلسلة اليوم — ${mealName} · الترتيب ${report.sequence}.`);
    } catch (error) {
      toast((error as Error).message || 'تعذّر حفظ التقرير، حاول مرة أخرى', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {myMeals.length === 0 ? (
        <Banner kind="warning">لا يمكنك الكتابة الآن: إما أنك غير مسند إلى كادر، أو أن وجبتك ليست المناوبة في جدول اليوم. اطلب من المسؤول ضبط جدول المناوبة.</Banner>
      ) : (
        <>
          {success && <Banner kind="info">{success}</Banner>}
          <div className="card card-pad stack">
            <div className="grid grid-2">
              <Field label="التاريخ" hint="يُربط التقرير تلقائياً بتاريخ اليوم.">
                <input className="input" value={formatDateAr(todayKey())} readOnly />
              </Field>
              <Field label="الوجبة المناوبة" hint="تظهر وجبة اليوم المناوبة فقط، وهي الوحيدة المسموحة بالكتابة.">
                <select className="select" value={activeMealId} onChange={(event) => setMealId(event.target.value)}>
                  {myMeals.map((meal) => <option key={meal.id} value={meal.id}>{meal.order + 1} · {meal.name} — {meal.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="محتوى التقرير">
              <textarea
                className="textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="اكتب ما تم إنجازه في هذه الوجبة، أي ملاحظات، والمهام المتتابعة للوجبة التالية…"
              />
            </Field>

            <div className="divider" />

            <div className="stack">
              <div className="spread">
                <div>
                  <strong className="small">المرفقات</strong>
                  <p className="tiny muted" style={{ margin: 0 }}>نصوص، صور، وملفات PDF — تُحفظ مشفّرة وتظهر في المكتبة.</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>+ إضافة ملف</button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept="image/*,application/pdf,.txt,.md,.csv,.json,.log"
                  onChange={(event) => {
                    void addFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </div>

              <div className="row">
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 200 }}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="أو اكتب نصاً قصيراً لإرفاقه…"
                />
                <button className="btn btn-secondary btn-sm" onClick={handleNote}>إضافة كمرفق نصي</button>
              </div>

              {pending.length > 0 && (
                <div className="row">
                  {pending.map((item, index) => (
                    <span className="chip" key={`${item.name}-${index}`}>
                      {item.kind === 'image' ? '🖼' : item.kind === 'pdf' ? '📕' : '📄'} {item.name}
                      <button
                        className="icon-btn"
                        style={{ fontSize: 14 }}
                        aria-label={`إزالة ${item.name}`}
                        onClick={() => remove(index)}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : 'تسجيل التقرير في السجل'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
