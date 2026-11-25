/**
 * تصدير السجل إلى PDF بصيغة الدفتر الرسمي العربي (RTL).
 * يُنشأ HTML منظّم لكل يوم على حدة ثم يُحوَّل إلى صورة داخل PDF،
 * وهذا يحفظ تشكيل الحروف دون تضمين خط عربي يدوياً.
 * ملاحظة مهمة: التعليقات الجانبية غير ممرّرة إلى هذه الدالة إطلاقاً،
 * لذلك لا يمكن أن تظهر في ملف PDF أو في الطباعة.
 */
import type { AppState, DayApproval, DayLog, MealTask, Report } from '@/domain/types';
import { formatDateNumeric, formatDateTimeAr } from './date';

export interface PdfExportOptions {
  title: string;
  rangeLabel: string;
  fileName: string;
  reports: Report[];
  tasks: MealTask[];
  dayLogs: DayLog[];
  staff: AppState['staff'];
  approvals?: DayApproval[];
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));

const namesFor = (ids: string[], staff: AppState['staff']): string =>
  ids.map((id) => staff.find((member) => member.id === id)?.name ?? '').filter(Boolean).join('، ') || '—';

function buildHtml(options: PdfExportOptions): string {
  const dates = [...new Set([
    ...options.reports.map((item) => item.date),
    ...options.tasks.map((item) => item.date),
    ...options.dayLogs.map((item) => item.date),
  ])].sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) {
    return `<div dir="rtl" lang="ar" class="page"><div class="empty">لا توجد بيانات في النطاق المحدد.</div></div>`;
  }

  const days = dates.map((date, dayIndex) => {
    const log = options.dayLogs.find((item) => item.date === date);
    const approval = options.approvals?.find((item) => item.date === date);
    const reports = options.reports
      .filter((item) => item.date === date)
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt))
      // تقارير النظام القديمة ممثلة بالمهام؛ نخفيها حتى لا يتكرر السطر.
      .filter((item) => !item.systemKind || !item.taskId);
    const tasks = options.tasks.filter((item) => item.date === date);
    const openTasks = tasks.filter((item) => item.status === 'new' || item.status === 'done');
    const postponed = tasks.filter((item) => item.status === 'postponed');

    const work: string[] = reports.map((report) =>
      `<li><strong>${escapeHtml(report.mealName)}</strong> — ${escapeHtml(report.content)}` +
      `<span class="by"> (${escapeHtml(report.authorName)})</span></li>`);
    openTasks.forEach((task) => {
      const stamp = task.status === 'done'
        ? `<span class="stamp">تم الإنجاز + ${escapeHtml(task.completedBy ?? '—')}</span> `
        : '<span class="stamp pending">مطلوب</span> ';
      work.push(`<li>${stamp}<strong>${escapeHtml(task.title)}</strong>` +
        `${task.details ? ` — ${escapeHtml(task.details)}` : ''}` +
        `<span class="by"> (${escapeHtml(task.mealName)})</span></li>`);
    });

    const postponedItems = postponed.length
      ? postponed.map((task) => `<li>${escapeHtml(task.title)} — السبب: ${escapeHtml(task.postponedReason ?? '—')}</li>`).join('')
      : '<li>لا توجد أعمال مؤجلة.</li>';

    return `
      ${dayIndex > 0 ? '<div class="day-separator" aria-hidden="true"></div>' : ''}
      <section class="day">
        <div class="day-date">التاريخ: ${escapeHtml(formatDateNumeric(date))}</div>
        <table class="head-row">
          <tr>
            <td class="right"><strong>الحضور:</strong> ${escapeHtml(namesFor(log?.attendance ?? [], options.staff))}</td>
            <td class="left"><strong>المجازين:</strong> ${escapeHtml(namesFor(log?.leave ?? [], options.staff))}</td>
          </tr>
        </table>
        <div class="shift">الوجبة المناوبة: ${escapeHtml(log?.mealName || '—')}</div>
        <h3>١ · الأعمال اليومية والمهام المطلوبة</h3>
        ${work.length ? `<ol class="work">${work.join('')}</ol>` : '<p class="none">لا توجد أعمال مسجلة.</p>'}
        <h3>٢ · الأعمال المؤجلة - إن وجد</h3>
        <ul class="work deferred">${postponedItems}</ul>
        ${approval ? `<div class="approval">✓ معتمد من المسؤول — ${escapeHtml(approval.approvedBy)} · ${escapeHtml(formatDateTimeAr(approval.approvedAt))}</div>` : ''}
      </section>`;
  }).join('');

  return `
    <div dir="rtl" lang="ar" class="page">
      <header class="page-head">
        <h1>${escapeHtml(options.title)}</h1>
        <div>${escapeHtml(options.rangeLabel)} · ${escapeHtml(formatDateTimeAr(new Date().toISOString()))}</div>
      </header>
      ${days}
      <footer>مستند رسمي مُنشأ محلياً من السجل المشفّر — لا تتضمن النسخة التعليقات الجانبية.</footer>
      <style>
        * { box-sizing: border-box; }
        .page { width: 100%; background: #fff; color: #15262c; font-family: Tahoma, Arial, sans-serif; padding: 26px 30px; font-size: 13px; }
        .page-head { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; text-align: center; }
        .page-head h1 { margin: 0 0 6px; font-size: 22px; color: #0f766e; }
        .page-head div { color: #64757c; font-size: 11px; }
        .day { page-break-inside: avoid; }
        .day-date { display: table; margin: 0 auto 14px; padding: 9px 30px; border: 2px solid #0f766e; border-radius: 4px; font-weight: bold; font-size: 15px; background: #f1f8f7; }
        .head-row { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin-bottom: 8px; }
        .head-row td { border: 1px solid #b9c9cc; background: #f8fafb; padding: 9px 12px; width: 50%; vertical-align: top; line-height: 1.9; }
        .head-row .right { text-align: right; }
        .head-row .left { text-align: left; }
        .shift { font-size: 11px; color: #64757c; margin: 4px 0 16px; }
        h3 { font-size: 14px; color: #0f766e; border-inline-start: 4px solid #0f766e; padding-inline-start: 8px; margin: 16px 0 8px; }
        ol.work, ul.work { margin: 0; padding-inline-start: 24px; line-height: 1.95; }
        ol.work li, ul.work li { margin-bottom: 3px; }
        ul.work { list-style: none; padding-inline-start: 18px; }
        ul.work li::before { content: '•'; color: #0f766e; font-weight: bold; margin-inline-end: 8px; }
        .by { color: #64757c; font-size: 11px; }
        .stamp { display: inline-block; background: #e8f5ee; color: #16794f; border-radius: 8px; padding: 0 6px; font-size: 11px; }
        .stamp.pending { background: #fdf4e3; color: #9a6700; }
        .none { color: #64757c; margin: 0; }
        .approval { margin-top: 12px; padding: 7px 10px; background: #e8f5ee; color: #16794f; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .day-separator { border-top: 3px double #0f766e; margin: 28px 0; }
        .empty { text-align: center; padding: 80px 0; color: #64757c; }
        footer { margin-top: 26px; border-top: 1px solid #dde5e6; padding-top: 8px; font-size: 10px; color: #64757c; text-align: center; }
      </style>
    </div>`;
}

export async function exportReportsPdf(options: PdfExportOptions): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;background:#ffffff;z-index:-1;';
  host.innerHTML = buildHtml(options);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const canvas = await html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const fullSliceHeight = Math.floor(canvas.width * (pageHeight / pageWidth));

    let offset = 0;
    let firstPage = true;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(fullSliceHeight, canvas.height - offset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext('2d');
      if (!context) throw new Error('تعذّر إنشاء سياق الرسم للـ PDF');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (!firstPage) pdf.addPage();
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.94),
        'JPEG',
        0,
        0,
        pageWidth,
        pageHeight * (sliceHeight / fullSliceHeight),
      );
      firstPage = false;
      offset += sliceHeight;
    }

    pdf.save(`sijl-report-${options.fileName}.pdf`);
  } finally {
    host.remove();
  }
}
