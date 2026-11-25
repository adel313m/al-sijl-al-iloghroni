/** إضافة سريعة لتقرير/مرفق داخل سجل اليوم الموحّد، منسوب للمستخدم والوجبة المناوبة. */
import { useState } from 'react';
import { scheduleForDate } from '@/domain/selectors';
import { todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Banner, Field, Modal, useToast } from '@/ui/components/ui';
import { usePendingAttachments } from './usePendingAttachments';

export function QuickReportModal({ onClose }: { onClose: () => void }) {
  const { state, currentUser, actions } = useApp();
  const toast = useToast();
  const schedule = scheduleForDate(state, todayKey());
  const assignedIds = state.staff.find((member) => member.id === currentUser?.id)?.mealIds ?? [];
  const meal = state.meals.find((item) => item.id === schedule?.mealId && assignedIds.includes(item.id));

  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { pending, addFiles, addNote, remove } = usePendingAttachments();

  const submit = async () => {
    if (!currentUser || !meal) return toast('أنت غير مسموح لك بالكتابة في سجل اليوم', 'error');
    if (!content.trim()) return toast('اكتب محتوى التقرير أولاً', 'error');
    setBusy(true);
    try {
      const report = await actions.addReport({
        authorId: currentUser.id,
        authorName: currentUser.name,
        mealId: meal.id,
        content,
      }, currentUser);
      for (const item of pending) {
        await actions.addAttachment({ ...item, mealId: meal.id, reportId: report.id }, currentUser);
      }
      toast(`تمت إضافة التقرير · الوجبة ${report.sequence} في تتابع اليوم`);
      onClose();
    } catch (error) {
      toast((error as Error).message || 'تعذّر حفظ التقرير، حاول مرة أخرى', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="إضافة تقرير / مرفق لسجل اليوم"
      onClose={onClose}
      footer={<>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !meal}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ في السجل'}
        </button>
        <button className="btn btn-secondary" onClick={onClose}>إلغاء</button>
      </>}
    >
      <div className="stack">
        {!meal && <Banner kind="warning">لا توجد صلاحية كتابة: يجب أن تكون عضواً في الوجبة المناوبة لليوم.</Banner>}
        <Field label="صاحب التقرير">
          <input className="input" value={currentUser?.name ?? ''} readOnly />
        </Field>
        <Field label="الوجبة المناوبة" hint="تُحدَّد تلقائياً من جدول مناوبة اليوم؛ لا يمكن التسجيل لوجبة أخرى أثناء دوامك.">
          <input className="input" value={meal ? `${meal.order + 1} · ${meal.name} — ${meal.label}` : 'غير محددة'} readOnly />
        </Field>
        <Field label="محتوى التقرير">
          <textarea
            className="textarea"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="اكتب ملخص الوجبة أو الملاحظات المتتابعة…"
          />
        </Field>

        <div className="divider" />

        <div className="stack">
          <div className="spread">
            <div>
              <strong className="small">مرفقات اختيارية</strong>
              <p className="tiny muted" style={{ margin: 0 }}>نص، صورة أو PDF — تُحفظ مشفّرة وتظهر في المكتبة.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('quick-report-file')?.click()}>
              + إضافة ملف
            </button>
            <input
              id="quick-report-file"
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
              style={{ flex: 1, minWidth: 180 }}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="أو اكتب نصاً قصيراً لإرفاقه…"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { if (addNote(note)) setNote(''); }}
            >
              إضافة كمرفق نصي
            </button>
          </div>
          {pending.length > 0 && (
            <div className="row">
              {pending.map((item, index) => (
                <span className="chip" key={`${item.name}-${index}`}>
                  {item.kind === 'image' ? '🖼' : item.kind === 'pdf' ? '📕' : '📄'} {item.name}
                  <button className="icon-btn" style={{ fontSize: 14 }} aria-label={`إزالة ${item.name}`} onClick={() => remove(index)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
