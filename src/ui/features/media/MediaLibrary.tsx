/** مستودع الوسائط: تصنيف حسب الوجبة والتاريخ والنوع مع معاينة للجميع. */
import { useState } from 'react';
import type { AttachmentKind } from '@/domain/types';
import { APP_CONFIG } from '@/config';
import { filteredAttachments, sortedMeals } from '@/domain/selectors';
import { classifyFile, readAsDataUrl, sampleImageDataUrl, samplePdfDataUrl } from '@/utils/file';
import { formatDateAr, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Field, Modal, useToast } from '@/ui/components/ui';
import { usePreview } from './PreviewContext';

const KIND_LABEL: Record<AttachmentKind, string> = { text: 'نص', image: 'صورة', pdf: 'PDF' };

export function MediaLibrary({ canDelete = false }: { canDelete?: boolean }) {
  const { state, actions } = useApp();
  const toast = useToast();
  const { open } = usePreview();
  const [date, setDate] = useState('');
  const [mealId, setMealId] = useState('');
  const [kind, setKind] = useState<AttachmentKind | ''>('');
  const [uploading, setUploading] = useState(false);

  const dates = [...new Set(state.attachments.map((item) => item.date))].sort((a, b) => b.localeCompare(a));
  const items = filteredAttachments(state, {
    date: date || undefined,
    mealId: mealId || undefined,
    kind: kind || undefined,
  });

  const clearFilters = () => {
    setDate('');
    setMealId('');
    setKind('');
  };

  /** حفظ مرفق مستقل (بدون تقرير) وتطبيق فلاتر تُظهره فوراً لتجربة التصنيف. */
  const saveAttachment = async (input: {
    name: string;
    kind: AttachmentKind;
    mimeType: string;
    size: number;
    dataUrl: string;
    mealId: string;
  }) => {
    await actions.addAttachment(input);
    setDate(todayKey());
    setMealId(input.mealId);
    setKind(input.kind);
    setUploading(false);
    toast('تم حفظ الملف مشفّراً محلياً وتطبيق الفلاتر لإظهاره');
  };

  return (
    <div className="stack">
      <div className="card card-pad stack">
        <div className="spread" style={{ gap: 'var(--s3)' }}>
          <div>
            <strong>تصفية المستودع</strong>
            <p className="tiny muted" style={{ margin: 0 }}>التاريخ، الوجبة، ونوع الملف.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>+ رفع سريع / ملف تجريبي</button>
        </div>
        <div className="row">
          <div className="field" style={{ minWidth: 180 }}>
            <label className="form-label">التاريخ</label>
            <select className="select" value={date} onChange={(event) => setDate(event.target.value)}>
              <option value="">كل الأيام</option>
              {dates.map((value) => <option key={value} value={value}>{formatDateAr(value)}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label className="form-label">الوجبة</label>
            <select className="select" value={mealId} onChange={(event) => setMealId(event.target.value)}>
              <option value="">كل الوجبات</option>
              {sortedMeals(state).map((meal) => <option key={meal.id} value={meal.id}>{meal.name} — {meal.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 130 }}>
            <label className="form-label">النوع</label>
            <select className="select" value={kind} onChange={(event) => setKind(event.target.value as AttachmentKind | '')}>
              <option value="">كل الأنواع</option>
              <option value="text">نص</option>
              <option value="image">صورة</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'end' }}>مسح الفلاتر</button>
        </div>
      </div>

      <p className="small muted" style={{ margin: 0 }}>{items.length} ملف مطابق · محفوظة مشفّرة محلياً</p>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-glyph" aria-hidden="true">🗂</div>
          <h3>{state.attachments.length === 0 ? 'المستودع فارغ' : 'لا توجد ملفات مطابقة للفلاتر'}</h3>
          <p className="small" style={{ maxWidth: 460 }}>
            {state.attachments.length === 0
              ? 'أضف صورة أو PDF تجريبياً بالضغط على «رفع سريع / ملف تجريبي»، أو أرفق ملفاً داخل تقريرك وسيظهر هنا مصنّفاً تلقائياً حسب الوجبة والتاريخ والنوع.'
              : 'جرّب تغيير التاريخ أو الوجبة أو النوع، أو امسح الفلاتر لعرض كل الملفات المحفوظة.'}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {state.attachments.length === 0 ? (
              <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>أضف ملفاً تجريبياً الآن</button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>مسح الفلاتر</button>
            )}
          </div>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((item) => (
            <div key={item.id} className="card media-card">
              <button
                className="media-thumb"
                onClick={() => open(item)}
                aria-label={`معاينة ${item.name}`}
                style={{ border: 0, width: '100%', padding: 0 }}
              >
                {item.kind === 'image' ? (
                  <img src={item.dataUrl} alt={item.name} />
                ) : (
                  <span className="glyph" aria-hidden="true">{item.kind === 'pdf' ? '📕' : '📄'}</span>
                )}
              </button>
              <div className="media-meta">
                <span className="media-name">{item.name}</span>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge badge-accent">{KIND_LABEL[item.kind]}</span>
                  <span className="tiny muted">{item.mealName}</span>
                </div>
                <span className="tiny muted">{formatDateAr(item.date)}</span>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => open(item)}>معاينة</button>
                  {canDelete && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (window.confirm(`حذف «${item.name}» من المستودع؟`)) {
                          void actions.removeAttachment(item.id).then(() => toast('تم حذف المرفق'));
                        }
                      }}
                    >حذف</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <QuickUploadModal
          onClose={() => setUploading(false)}
          onSave={saveAttachment}
        />
      )}
    </div>
  );
}

function QuickUploadModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: {
    name: string;
    kind: AttachmentKind;
    mimeType: string;
    size: number;
    dataUrl: string;
    mealId: string;
  }) => Promise<void>;
}) {
  const { state } = useApp();
  const toast = useToast();
  const meals = sortedMeals(state);
  const [mealId, setMealId] = useState(meals[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  type UploadInput = Omit<Parameters<typeof onSave>[0], 'mealId'>;
  const save = async (input: UploadInput) => {
    if (!mealId) return toast('أضف وجبة أولاً من إعدادات الوجبات', 'error');
    setBusy(true);
    try { await onSave({ ...input, mealId }); } finally { setBusy(false); }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const kind = classifyFile(file);
      if (!kind) { toast(`النوع غير مدعوم: ${file.name}`, 'error'); continue; }
      if (file.size > APP_CONFIG.maxAttachmentBytes) { toast(`الملف أكبر من 2MB: ${file.name}`, 'error'); continue; }
      try {
        await save({
          name: file.name,
          kind,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: await readAsDataUrl(file),
        });
      } catch { toast(`تعذّرت قراءة ${file.name}`, 'error'); }
    }
  };

  const image = sampleImageDataUrl();
  const pdf = samplePdfDataUrl();

  return (
    <Modal
      title="رفع سريع إلى المستودع"
      onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>إغلاق</button>}
    >
      <div className="stack">
        <Field label="الوجبة" hint="تُستخدم لتصنيف الملف في المكتبة وتطبيق الفلتر بعد الحفظ.">
          <select className="select" value={mealId} onChange={(event) => setMealId(event.target.value)}>
            {meals.map((meal) => <option key={meal.id} value={meal.id}>{meal.name} — {meal.label}</option>)}
          </select>
        </Field>

        <div className="row">
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => document.getElementById('quick-media-file')?.click()}
          >اختيار صورة أو PDF من الجهاز</button>
          <input
            id="quick-media-file"
            type="file"
            hidden
            multiple
            accept="image/*,application/pdf,.txt,.md,.csv,.json,.log"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        <div className="divider" />
        <p className="small muted" style={{ margin: 0 }}>أو جرّب ملفاً تجريبياً جاهزاً لاختبار الفلاتر فوراً:</p>
        <div className="row">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void save({
              name: `صورة-تجريبية-${todayKey()}.png`,
              kind: 'image',
              mimeType: 'image/png',
              size: Math.ceil((image.length - 22) * 0.75),
              dataUrl: image,
            })}
          >+ صورة تجريبية</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void save({
              name: `ملف-تجريبي-${todayKey()}.pdf`,
              kind: 'pdf',
              mimeType: 'application/pdf',
              size: Math.ceil((pdf.length - 28) * 0.75),
              dataUrl: pdf,
            })}
          >+ PDF تجريبي</button>
        </div>
      </div>
    </Modal>
  );
}
