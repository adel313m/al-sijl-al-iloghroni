/** دوال اشتقاق خالصة (Pure Selectors) — لا تعديل للحالة، تُستخدم من الواجهة. */
import type { AppState, Attachment, AttachmentKind, DayApproval, DayLog, DayLogComment, DaySchedule, MealTask, Report, Session, StaffMember } from './types';

export const sortedMeals = (state: AppState) => [...state.meals].sort((a, b) => a.order - b.order);

export const staffForMeal = (state: AppState, mealId: string): StaffMember[] =>
  state.staff.filter((member) => member.mealIds.includes(mealId));

export const reportsForDate = (state: AppState, date: string): Report[] =>
  state.reports
    .filter((report) => report.date === date)
    .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));

export const availableDates = (state: AppState): string[] =>
  [...new Set(state.reports.map((report) => report.date))].sort((a, b) => b.localeCompare(a));

export const attachmentsForReport = (state: AppState, reportId: string): Attachment[] =>
  state.attachments.filter((attachment) => attachment.reportId === reportId);

export interface MediaFilter {
  date?: string;
  mealId?: string;
  kind?: AttachmentKind;
}

export const filteredAttachments = (state: AppState, filter: MediaFilter): Attachment[] =>
  state.attachments
    .filter((attachment) => !filter.date || attachment.date === filter.date)
    .filter((attachment) => !filter.mealId || attachment.mealId === filter.mealId)
    .filter((attachment) => !filter.kind || attachment.kind === filter.kind)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

/** تسمية تتابع readable: "1 · Morning" */
export const sequenceLabel = (report: Report): string => `${report.sequence} · ${report.mealName}`;

export const sortedTasks = (state: AppState): MealTask[] =>
  [...state.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const scheduleForDate = (state: AppState, date: string): DaySchedule | undefined =>
  state.schedules.find((item) => item.date === date);

export const approvalForDate = (state: AppState, date: string): DayApproval | undefined =>
  state.approvals.find((item) => item.date === date);

/** الوجبة التالية في التتابع بعد وجبة مهمة مؤجلة. */
export const nextMealAfter = (state: AppState, mealId: string): string | undefined => {
  const meals = sortedMeals(state);
  const index = meals.findIndex((item) => item.id === mealId);
  return index >= 0 ? meals[index + 1]?.id : undefined;
};

/** مهام جديدة موجّهة لعضو/وجباته في يوم محدد. */
export const newTasksForMeals = (state: AppState, mealIds: string[], date: string): MealTask[] =>
  sortedTasks(state).filter((task) => task.status === 'new' && task.date === date && mealIds.includes(task.mealId));

/** مهام مؤجلة يجب أن تراها الوجبة التالية في التتابع. */
export const postponedForMeals = (state: AppState, mealIds: string[], date: string): MealTask[] =>
  sortedTasks(state).filter((task) =>
    task.status === 'postponed' && task.date === date && mealIds.includes(nextMealAfter(state, task.mealId) ?? ''),
  );

export const reportsInRange = (state: AppState, from: string, to: string): Report[] =>
  state.reports
    .filter((report) => report.date >= from && report.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);

export const dayLogForDate = (state: AppState, date: string): DayLog | undefined =>
  state.dayLogs.find((item) => item.date === date);

export const commentsForDate = (state: AppState, date: string): DayLogComment[] =>
  state.comments
    .filter((item) => item.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** هل يستطيع هذا المستخدم الكتابة في سجل يوم محدد؟
 *  الكتابة محصورة بأعضاء الوجبة المناوبة في جدول ذلك اليوم. المسؤول يضبط الجدول والحضور فقط. */
export const canWriteLog = (state: AppState, actor: Session | null, date: string, mealId?: string): boolean => {
  if (!actor) return false;
  const schedule = scheduleForDate(state, date);
  if (!schedule || (mealId && mealId !== schedule.mealId)) return false;
  if (actor.role !== 'staff') return false;
  const member = state.staff.find((item) => item.id === actor.id && item.active);
  return Boolean(member?.mealIds.includes(schedule.mealId));
};

/** عناصر «الأعمال اليومية»: تقارير الوجبة + المهام المنجزة، بدون أسطر مكررة. */
export interface DailyWorkItem {
  id: string;
  kind: 'report' | 'task';
  text: string;
  stamp?: string;
  mealName: string;
  authorName: string;
  createdAt: string;
}

export const dailyWorkItems = (state: AppState, date: string): DailyWorkItem[] => {
  const reports = reportsForDate(state, date)
    // تقارير النظام القديمة أصبحت ممثلة بالمهام نفسها؛ نخفيها لمنع التكرار.
    .filter((report) => !report.systemKind || !report.taskId)
    .map<DailyWorkItem>((report) => ({
      id: report.id,
      kind: 'report',
      text: report.content,
      mealName: report.mealName,
      authorName: report.authorName,
      createdAt: report.createdAt,
    }));
  const tasks = state.tasks
    .filter((task) => task.date === date && task.status === 'done')
    .map<DailyWorkItem>((task) => ({
      id: task.id,
      kind: 'task',
      text: task.title,
      stamp: `تم الإنجاز + ${task.completedBy ?? '—'}`,
      mealName: task.mealName,
      authorName: task.completedBy ?? '—',
      createdAt: task.completedAt ?? task.createdAt,
    }));
  return [...reports, ...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const postponedWorkItems = (state: AppState, date: string): MealTask[] =>
  state.tasks
    .filter((task) => task.date === date && task.status === 'postponed')
    .sort((a, b) => (b.postponedAt ?? '').localeCompare(a.postponedAt ?? ''));

