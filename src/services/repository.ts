/**
 * مستودع البيانات (Repository)
 * ----------------------------
 * الطبقة الوحيدة التي تُحوّل أوامر الواجهة إلى عمليات تخزين + وسيط.
 * لا يعرف شيء عن React، لذا يمكن اختباره أو إعادة استخدامه في تطبيق جوال
 * لاحقاً بمجرد تبديل الـ Storage Adapter والـ Relay Adapter.
 */
import type {
  ActivityEntry,
  AdminAccount,
  AppState,
  Attachment,
  Broadcast,
  DayApproval,
  DayLog,
  DayLogComment,
  DaySchedule,
  EmailVerification,
  Meal,
  MealTask,
  RelayConfig,
  RelayEventInput,
  Report,
  Session,
  SheetSnapshot,
  SheetSyncPayload,
  StaffMember,
  TaskPriority,
  WeeklyDigest,
} from '@/domain/types';
import { createDefaultState, migrateState } from '@/domain/defaults';
import { canWriteLog, staffForMeal } from '@/domain/selectors';
import { generatePin, newId } from '@/utils/id';
import { shiftDateKey, todayKey } from '@/utils/date';
import { cryptoService } from './crypto';
import { stateStorage } from './storage';
import { getRelayAdapter } from './relay';

export interface NewReportInput {
  authorId: string;
  authorName: string;
  mealId: string;
  content: string;
  attachmentIds?: string[];
}

export interface NewAttachmentInput {
  name: string;
  kind: Attachment['kind'];
  mimeType: string;
  size: number;
  dataUrl: string;
  mealId: string;
  reportId?: string; // اختياري للمرفقات المستقلة في المستودع
}

export interface NewStaffInput {
  name: string;
  pin: string;
  mealIds: string[];
}

export interface NewTaskInput {
  title: string;
  details: string;
  priority: TaskPriority;
  mealId: string;
  createdBy: string;
}

/** أسماء مختصرة تظهر في سجل نشاط الوسيط. */
const ACTIVITY_LABEL: Record<ActivityEntry['type'], string> = {
  report: 'تقرير',
  attachment: 'مرفق',
  settings: 'إعدادات',
  task: 'مهمة',
  broadcast: 'تنبيه',
  approval: 'اعتماد',
  schedule: 'مناوبة',
  dayLog: 'سجل يوم',
  comment: 'تعليق جانبي',
  weeklyDigest: 'لقطة أسبوعية',
  sheetPush: 'دفع شيتس',
  sheetPull: 'سحب شيتس',
  emailVerify: 'تأكيد بريد',
  ack: 'تأكيد',
};

const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

function assertGmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!GMAIL_RE.test(normalized)) {
    throw new Error('البريد الإداري يجب أن يكون بريد Gmail رسمياً بصيغة name@gmail.com');
  }
  return normalized;
}

class Repository {
  private state: AppState | null = null;
  private listeners = new Set<(state: AppState) => void>();
  private mutex: Promise<void> = Promise.resolve();

  /** تحميل الحالة مرة واحدة عند بدء التطبيق. */
  async init(): Promise<AppState> {
    if (!this.state) this.state = migrateState(await stateStorage.load());
    return this.state;
  }

  getSnapshot(): AppState {
    return this.state ?? createDefaultState();
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.getSnapshot()));
  }

  /** منع تداخل عمليات الحفظ المتزامنة (تعدد النقرات أو مزامنة تلقائية). */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(fn, fn);
    this.mutex = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** نواة التعديل: نسخة عميقة → تعديل → تشفير الأحداث → حفظ → إشعار الواجهة. */
  private async commit(
    mutator: (draft: AppState) => void,
    events: RelayEventInput[] = [],
  ): Promise<AppState> {
    return this.withLock(async () => {
      const draft = structuredClone(this.getSnapshot());
      mutator(draft);

      for (const event of events) {
        draft.outbox.push({
          id: newId('msg'),
          type: event.type,
          payload: await cryptoService.encrypt(JSON.stringify(event.data)),
          createdAt: new Date().toISOString(),
        });
      }

      await stateStorage.save(draft);
      this.state = draft;
      this.emit();
      return draft;
    });
  }

  /** إعادة ترتيب أرقام التتابع ليوم ما حسب ترتيب الوجبة ثم وقت الإنشاء. */
  private recomputeSequences(draft: AppState, date: string): void {
    const orderOf = new Map(draft.meals.map((meal) => [meal.id, meal.order]));
    const sorted = draft.reports
      .filter((report) => report.date === date)
      .sort((a, b) => {
        const orderDiff = (orderOf.get(a.mealId) ?? 999) - (orderOf.get(b.mealId) ?? 999);
        return orderDiff !== 0 ? orderDiff : a.createdAt.localeCompare(b.createdAt);
      });
    sorted.forEach((report, index) => {
      report.sequence = index + 1;
    });
  }

  /**
   * إضافة سطر نشاط مع دمج الأسطر المطابقة خلال دقيقة واحدة.
   * هذا يمنع تكرار أسطر «إرسال/تأكيد» المتقاربة ويجعل السجل مقروءاً.
   */
  private pushActivity(draft: AppState, entry: Omit<ActivityEntry, 'id' | 'at' | 'count'>): void {
    const now = Date.now();
    const index = draft.activity.findIndex((item) =>
      item.label === entry.label &&
      item.direction === entry.direction &&
      item.type === entry.type &&
      item.ok === entry.ok &&
      now - new Date(item.at).getTime() < 60_000
    );
    if (index >= 0) {
      const [existing] = draft.activity.splice(index, 1);
      existing.count = (existing.count ?? 1) + 1;
      existing.at = new Date(now).toISOString();
      draft.activity.unshift(existing); // إبقاء الأحدث في الأعلى
      return;
    }
    draft.activity.unshift({ ...entry, id: newId('act'), at: new Date(now).toISOString(), count: 1 });
  }

  /**
   * قفل الكتابة على الوجبة المناوبة فقط. عند تمرير المستخدم (كما تفعل الواجهة)
   * يُرفض أي تعديل من غير أعضاء وجبة جدول اليوم أو من وجبة أخرى.
   * عدم تمرير المستخدم متروك لعمليات التهيئة والاختبارات القديمة.
   */
  private assertLogWrite(actor: Session | undefined, date: string, mealId?: string): void {
    if (!actor) return;
    if (!canWriteLog(this.getSnapshot(), actor, date, mealId)) {
      throw new Error('الكتابة في السجل مسموحة فقط لأعضاء الوجبة المناوبة في جدول هذا اليوم');
    }
  }

  // ---------- التهيئة والحسابات ----------

  async setupAdmin(
    email: string,
    password: string | null,
    googleLinked: boolean,
    verified: boolean,
  ): Promise<AppState> {
    const normalized = assertGmail(email);
    const now = new Date().toISOString();
    const admin: AdminAccount = {
      email: normalized,
      passwordHash: password ? await cryptoService.hashSecret(password) : null,
      googleLinked,
      emailVerified: verified,
      verifiedAt: verified ? now : null,
      createdAt: now,
    };
    return this.commit((draft) => {
      draft.admin = admin;
      draft.initialized = true;
      // البريد المؤكَّد هو المرجع الإداري الوحيد لوجهة PDF ولخدمات Google القادمة.
      draft.relay.adminEmail = normalized;
      draft.relay.lastDigestSignature = '';
      draft.pendingVerification = null;
    });
  }

  /** إنشاء رمز تأكيد لـ Gmail. في وضع GAS يُرسل فعلياً عبر MailApp، وفي المحاكاة يُعرض في الواجهة. */
  async requestEmailVerification(email: string, purpose: EmailVerification['purpose']): Promise<string> {
    const normalized = assertGmail(email);
    const code = generatePin(6);
    const entry: EmailVerification = {
      email: normalized,
      code,
      purpose,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    const snapshot = this.getSnapshot();
    const adapter = getRelayAdapter(snapshot.relay);
    if (adapter.kind === 'gas') {
      const result = await adapter.sendVerificationCode(normalized, code, snapshot.relay);
      if (!result.ok) throw new Error(result.error ?? 'تعذّر إرسال رمز التأكيد');
    }

    await this.commit((draft) => {
      draft.pendingVerification = entry;
      this.pushActivity(draft, {
        direction: 'out',
        type: 'emailVerify',
        label: `إرسال رمز تأكيد إلى ${normalized}`,
        ok: true,
      });
    });
    return code;
  }

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    const pending = this.getSnapshot().pendingVerification;
    if (!pending || pending.email !== email.trim().toLowerCase()) return false;
    if (pending.code !== code.trim()) return false;
    return Date.parse(pending.expiresAt) > Date.now();
  }

  async completeAdminSetup(
    email: string,
    password: string | null,
    googleLinked: boolean,
    code: string,
  ): Promise<AppState> {
    if (!(await this.verifyEmailCode(email, code))) {
      throw new Error('رمز التأكيد غير صحيح أو منتهي');
    }
    return this.setupAdmin(email, password, googleLinked, true);
  }

  /** تأكيد البريد الحالي أو اعتماد بريد جديد بعد إدخال الرمز. */
  async confirmAdminEmail(email: string, code: string): Promise<AppState> {
    if (!(await this.verifyEmailCode(email, code))) {
      throw new Error('رمز التأكيد غير صحيح أو منتهي');
    }
    const normalized = assertGmail(email);
    const now = new Date().toISOString();
    return this.commit((draft) => {
      if (draft.admin) {
        draft.admin.email = normalized;
        draft.admin.emailVerified = true;
        draft.admin.verifiedAt = now;
      }
      draft.relay.adminEmail = normalized;
      draft.relay.lastDigestSignature = ''; // إعادة إرسال اللقطة الأسبوعية بالبريد الجديد
      draft.pendingVerification = null;
      this.pushActivity(draft, {
        direction: 'in',
        type: 'emailVerify',
        label: `تأكيد البريد الإداري ${normalized}`,
        ok: true,
      });
    });
  }

  async verifyAdminPassword(password: string): Promise<boolean> {
    const hash = this.getSnapshot().admin?.passwordHash;
    return hash ? cryptoService.verifySecret(password, hash) : false;
  }

  async verifyStaffPin(staffId: string, pin: string): Promise<boolean> {
    const member = this.getSnapshot().staff.find((item) => item.id === staffId);
    return member ? cryptoService.verifySecret(pin, member.pinHash) : false;
  }

  // ---------- الوجبات ----------

  async addMeal(name: string, label: string): Promise<AppState> {
    return this.commit(
      (draft) => {
        const order = draft.meals.reduce((max, meal) => Math.max(max, meal.order), -1) + 1;
        draft.meals.push({ id: newId('meal'), name: name.trim(), label: label.trim(), order });
      },
      [],
    );
  }

  async updateMeal(id: string, patch: Partial<Pick<Meal, 'name' | 'label'>>): Promise<AppState> {
    return this.commit((draft) => {
      const meal = draft.meals.find((item) => item.id === id);
      if (meal) Object.assign(meal, patch);
      draft.reports.forEach((report) => {
        if (report.mealId === id && patch.name) report.mealName = patch.name;
      });
      draft.attachments.forEach((attachment) => {
        if (attachment.mealId === id && patch.name) attachment.mealName = patch.name;
      });
    });
  }

  async removeMeal(id: string): Promise<AppState> {
    return this.commit((draft) => {
      draft.meals = draft.meals.filter((meal) => meal.id !== id);
      draft.meals.sort((a, b) => a.order - b.order).forEach((meal, index) => (meal.order = index));
      draft.staff.forEach((member) => {
        member.mealIds = member.mealIds.filter((mealId) => mealId !== id);
      });
      // نحتفظ بالتقارير القديمة لأغراض السجل حتى لو حُذفت الوجبة.
    });
  }

  /** ترتيب جديد كامل للوجبات (يُستخدم بعد السحب/التحريك في واجهة المسؤول). */
  async reorderMeals(orderedIds: string[]): Promise<AppState> {
    return this.commit((draft) => {
      orderedIds.forEach((id, index) => {
        const meal = draft.meals.find((item) => item.id === id);
        if (meal) meal.order = index;
      });
      draft.meals.sort((a, b) => a.order - b.order);
      const dates = new Set(draft.reports.map((report) => report.date));
      dates.forEach((date) => this.recomputeSequences(draft, date));
    });
  }

  // ---------- الكادر ----------

  async addStaff(input: NewStaffInput): Promise<AppState> {
    const pinHash = await cryptoService.hashSecret(input.pin.trim());
    const pinEncrypted = await cryptoService.encrypt(input.pin.trim());
    const member: StaffMember = {
      id: newId('staff'),
      name: input.name.trim(),
      pinHash,
      pinEncrypted,
      mealIds: input.mealIds,
      active: true,
      createdAt: new Date().toISOString(),
    };
    return this.commit(
      (draft) => {
        draft.staff.push(member);
      },
      [{ type: 'settings', data: { meals: this.getSnapshot().meals, staff: [...this.getSnapshot().staff, member], relay: this.getSnapshot().relay } }],
    );
  }

  async updateStaff(
    id: string,
    patch: { name?: string; mealIds?: string[]; active?: boolean; pin?: string },
  ): Promise<AppState> {
    const pinHash = patch.pin ? await cryptoService.hashSecret(patch.pin.trim()) : undefined;
    const pinEncrypted = patch.pin ? await cryptoService.encrypt(patch.pin.trim()) : undefined;
    return this.commit((draft) => {
      const member = draft.staff.find((item) => item.id === id);
      if (!member) return;
      if (patch.name) member.name = patch.name.trim();
      if (patch.mealIds) member.mealIds = patch.mealIds;
      if (typeof patch.active === 'boolean') member.active = patch.active;
      if (pinHash) member.pinHash = pinHash;
      if (pinEncrypted) member.pinEncrypted = pinEncrypted;
    });
  }

  /** فك رمز العضو لعرضه للمسؤول (الرمز مشفّر في التخزين ولا يُحفظ كنص صريح). */
  async revealStaffPin(id: string): Promise<string> {
    const member = this.getSnapshot().staff.find((item) => item.id === id);
    if (!member) return '';
    try {
      return await cryptoService.decrypt(member.pinEncrypted);
    } catch {
      return '—';
    }
  }

  /** نقل عضو بين وجبتين: إزالة من وجبة وإضافة إلى أخرى. */
  async moveStaff(id: string, fromMealId: string, toMealId: string): Promise<AppState> {
    return this.commit((draft) => {
      const member = draft.staff.find((item) => item.id === id);
      if (!member) return;
      member.mealIds = [...new Set(member.mealIds.filter((mealId) => mealId !== fromMealId).concat(toMealId))];
    });
  }

  async removeStaff(id: string): Promise<AppState> {
    return this.commit((draft) => {
      draft.staff = draft.staff.filter((member) => member.id !== id);
    });
  }

  // ---------- التقارير والمرفقات ----------

  async addReport(input: NewReportInput, actor?: Session): Promise<Report> {
    const date = todayKey(); // YYYY-MM-DD حسب توقيت الجهاز
    this.assertLogWrite(actor, date, input.mealId);
    const meal = this.getSnapshot().meals.find((item) => item.id === input.mealId);
    const report: Report = {
      id: newId('report'),
      authorId: input.authorId,
      authorName: input.authorName,
      mealId: input.mealId,
      mealName: meal?.name ?? 'غير معروف',
      date,
      createdAt: new Date().toISOString(),
      sequence: 0,
      content: input.content.trim(),
      attachmentIds: input.attachmentIds ?? [],
      synced: false,
    };
    await this.commit(
      (draft) => {
        draft.reports.push(report);
        this.recomputeSequences(draft, date);
      },
      [{ type: 'report', data: report }],
    );
    return report;
  }

  /** تعديل مستمر على سجل اليوم من عضو الوجبة المناوبة فقط. */
  async updateReport(reportId: string, patch: { content?: string }, actor?: Session): Promise<AppState> {
    const current = this.getSnapshot();
    const report = current.reports.find((item) => item.id === reportId);
    if (!report) return current;
    this.assertLogWrite(actor, report.date, report.mealId);
    return this.commit((draft) => {
      const target = draft.reports.find((item) => item.id === reportId);
      if (target && typeof patch.content === 'string' && patch.content.trim()) {
        target.content = patch.content.trim();
      }
    });
  }

  async addAttachment(input: NewAttachmentInput, actor?: Session): Promise<Attachment> {
    const date = todayKey();
    this.assertLogWrite(actor, date, input.mealId);
    const meal = this.getSnapshot().meals.find((item) => item.id === input.mealId);
    const attachment: Attachment = {
      id: newId('file'),
      name: input.name,
      kind: input.kind,
      mimeType: input.mimeType,
      size: input.size,
      dataUrl: input.dataUrl,
      mealId: input.mealId,
      mealName: meal?.name ?? 'غير معروف',
      reportId: input.reportId ?? null,
      date,
      uploadedAt: new Date().toISOString(),
    };
    await this.commit(
      (draft) => {
        draft.attachments.push(attachment);
        const report = input.reportId
          ? draft.reports.find((item) => item.id === input.reportId)
          : undefined;
        if (report && !report.attachmentIds.includes(attachment.id)) {
          report.attachmentIds.push(attachment.id);
        }
      },
      [{ type: 'attachment', data: attachment }],
    );
    return attachment;
  }

  async removeAttachment(id: string): Promise<AppState> {
    return this.commit((draft) => {
      draft.attachments = draft.attachments.filter((item) => item.id !== id);
      draft.reports.forEach((report) => {
        report.attachmentIds = report.attachmentIds.filter((attachmentId) => attachmentId !== id);
      });
    });
  }

  // ---------- جدول المناوبة والمهام والتنبيهات ----------

  async setDaySchedule(date: string, mealId: string): Promise<AppState> {
    const meal = this.getSnapshot().meals.find((item) => item.id === mealId);
    const entry: DaySchedule = {
      date,
      mealId,
      mealName: meal?.name ?? 'غير معروف',
      updatedAt: new Date().toISOString(),
    };
    return this.commit(
      (draft) => {
        draft.schedules = [...draft.schedules.filter((item) => item.date !== date), entry];
      },
      [{ type: 'schedule', data: entry }],
    );
  }

  /**
   * حفظ رأس السجل الموحّد (الحضور والمجازين). المسؤول أو عضو الوجبة المناوبة فقط.
   * لا يُسمح بإدراج أسماء من خارج أعضاء تلك الوجبة.
   */
  async setDayLog(
    date: string,
    patch: { attendance: string[]; leave: string[] },
    actor: Session,
  ): Promise<AppState> {
    const snapshot = this.getSnapshot();
    const schedule = snapshot.schedules.find((item) => item.date === date);
    if (!schedule) throw new Error('حدّد جدول مناوبة هذا اليوم أولاً');
    const allowed = new Set(staffForMeal(snapshot, schedule.mealId).map((member) => member.id));
    const clean = (ids: string[]) => [...new Set(ids)].filter((id) => allowed.has(id));
    const entry: DayLog = {
      date,
      mealId: schedule.mealId,
      mealName: schedule.mealName,
      attendance: clean(patch.attendance),
      leave: clean(patch.leave),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.name,
    };
    const isAdmin = actor.role === 'admin';
    const isOnDuty = actor.role === 'staff' && allowed.has(actor.id);
    if (!isAdmin && !isOnDuty) throw new Error('فقط مسؤول أو عضو من الوجبة المناوبة يمكنه ضبط الحضور');
    return this.commit(
      (draft) => {
        draft.dayLogs = [...draft.dayLogs.filter((item) => item.date !== date), entry];
      },
      [{ type: 'dayLog', data: entry }],
    );
  }

  /** تعليق جانبي: متاح لكل مستخدم، ومحفوظ مشفّراً، ولا يُرسل إلى مولّد PDF. */
  async addComment(date: string, content: string, actor: Session): Promise<DayLogComment> {
    const entry: DayLogComment = {
      id: newId('comment'),
      date,
      authorId: actor.id,
      authorName: actor.name,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    await this.commit(
      (draft) => { draft.comments.push(entry); },
      [{ type: 'comment', data: entry }],
    );
    return entry;
  }

  async removeComment(commentId: string, actor: Session): Promise<AppState> {
    const comment = this.getSnapshot().comments.find((item) => item.id === commentId);
    if (!comment) return this.getSnapshot();
    if (actor.role !== 'admin' && comment.authorId !== actor.id) {
      throw new Error('يمكن حذف تعليقك فقط أو حذف التعليقات كمسؤول');
    }
    return this.commit((draft) => {
      draft.comments = draft.comments.filter((item) => item.id !== commentId);
    });
  }

  async assignTask(input: NewTaskInput): Promise<MealTask> {
    const current = this.getSnapshot();
    const targetMealId = input.mealId ||
      current.schedules.find((item) => item.date === todayKey())?.mealId ||
      current.meals[0]?.id || '';
    const meal = current.meals.find((item) => item.id === targetMealId);
    const task: MealTask = {
      id: newId('task'),
      title: input.title.trim(),
      details: input.details.trim(),
      priority: input.priority,
      mealId: targetMealId,
      mealName: meal?.name ?? 'غير معروف',
      date: todayKey(),
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
      status: 'new',
    };
    await this.commit(
      (draft) => { draft.tasks.push(task); },
      [{ type: 'task', data: task }],
    );
    return task;
  }

  /**
   * إتمام المهمة يُدمج مباشرة في قائمة الأعمال اليومية عبر حالة المهمة نفسها،
   * دون إنشاء تقرير نظام منفصل حتى لا تتكرر الأسطر في السجل أو PDF.
   */
  async completeTask(taskId: string, _memberId: string, memberName: string, actor?: Session): Promise<MealTask | null> {
    const current = this.getSnapshot();
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'new') return null;
    this.assertLogWrite(actor, task.date, task.mealId);
    const now = new Date().toISOString();
    const updated: MealTask = { ...task, status: 'done', completedBy: memberName, completedAt: now };
    await this.commit(
      (draft) => {
        const index = draft.tasks.findIndex((item) => item.id === taskId);
        if (index >= 0) draft.tasks[index] = updated;
        // إزالة أي تقارير نظام قديمة كانت تُمثّل هذه المهمة لتفادي التكرار.
        draft.reports = draft.reports.filter((report) => report.taskId !== taskId || !report.systemKind);
      },
      [{ type: 'task', data: updated }],
    );
    return updated;
  }

  /** التأجيل يُسجَّل على المهمة نفسها، ويظهر في قسم «الأعمال المؤجلة» بالسجل وPDF. */
  async postponeTask(
    taskId: string,
    _memberId: string,
    memberName: string,
    reason: string,
    actor?: Session,
  ): Promise<MealTask | null> {
    const current = this.getSnapshot();
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'new' || !reason.trim()) return null;
    this.assertLogWrite(actor, task.date, task.mealId);
    const now = new Date().toISOString();
    const updated: MealTask = {
      ...task,
      status: 'postponed',
      postponedReason: reason.trim(),
      postponedAt: now,
      postponedBy: memberName,
    };
    await this.commit(
      (draft) => {
        const index = draft.tasks.findIndex((item) => item.id === taskId);
        if (index >= 0) draft.tasks[index] = updated;
        draft.reports = draft.reports.filter((report) => report.taskId !== taskId || !report.systemKind);
      },
      [{ type: 'task', data: updated }],
    );
    return updated;
  }

  /** إعادة توجيه مهمة مؤجلة إلى وجبة أخرى في التتابع. */
  async reassignTask(taskId: string, mealId: string): Promise<AppState> {
    const current = this.getSnapshot();
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task) return this.getSnapshot();
    const meal = current.meals.find((item) => item.id === mealId);
    const updated: MealTask = {
      ...task,
      mealId,
      mealName: meal?.name ?? 'غير معروف',
      status: 'new',
      reassignedToMealId: mealId,
      completedBy: undefined,
      completedAt: undefined,
    };
    return this.commit(
      (draft) => {
        const index = draft.tasks.findIndex((item) => item.id === taskId);
        if (index >= 0) draft.tasks[index] = updated;
      },
      [{ type: 'task', data: updated }],
    );
  }

  async publishBroadcast(message: string, createdBy: string): Promise<AppState> {
    const entry: Broadcast = {
      id: newId('cast'),
      message: message.trim(),
      createdAt: new Date().toISOString(),
      createdBy,
    };
    return this.commit(
      (draft) => { draft.broadcast = entry; },
      [{ type: 'broadcast', data: entry }],
    );
  }

  async clearBroadcast(createdBy: string): Promise<AppState> {
    const entry: Broadcast = {
      id: newId('cast'),
      message: '',
      createdAt: new Date().toISOString(),
      createdBy,
    };
    return this.commit(
      (draft) => { draft.broadcast = null; },
      [{ type: 'broadcast', data: entry }],
    );
  }

  async approveDay(date: string, approvedBy: string): Promise<DayApproval> {
    const current = this.getSnapshot();
    const reportedMeals = new Set(current.reports.filter((item) => item.date === date).map((item) => item.mealId));
    const missing = current.meals.filter((item) => !reportedMeals.has(item.id));
    if (missing.length > 0) {
      throw new Error(`لا يمكن اعتماد السجل قبل تسجيل تقارير كل الوجبات (المتبقي: ${missing.map((item) => item.name).join('، ')})`);
    }
    const approval: DayApproval = { date, approvedAt: new Date().toISOString(), approvedBy };
    await this.commit(
      (draft) => {
        draft.approvals = [...draft.approvals.filter((item) => item.date !== date), approval];
      },
      [{ type: 'approval', data: approval }],
    );
    return approval;
  }

  // ---------- الوسيط والمزامنة ----------

  async updateRelayConfig(patch: Partial<RelayConfig>): Promise<AppState> {
    return this.commit((draft) => {
      Object.assign(draft.relay, patch);
    });
  }

  // ---------- مزامنة الكادر والوجبات مع Google Sheets ----------

  /** دفع النسخة المحلية (بما فيها الرموز المشفّرة/المجزّأة) إلى أوراق العمل. */
  async pushSheets(): Promise<SheetSyncPayload> {
    const snapshot = this.getSnapshot();
    const config = snapshot.relay;
    if (!config.spreadsheetId.trim()) throw new Error('أدخل معرّف أو اسم ملف Google Sheets أولاً');

    const payload: SheetSyncPayload = {
      spreadsheetId: config.spreadsheetId.trim(),
      staffSheet: config.staffSheet.trim() || 'Staff_Directory',
      shiftsSheet: config.shiftsSheet.trim() || 'Shifts_Order',
      adminEmail: snapshot.admin?.email ?? config.adminEmail,
      meals: snapshot.meals.map((meal) => ({ ...meal })),
      staff: snapshot.staff.map((member) => ({ ...member })),
      pushedAt: new Date().toISOString(),
    };

    const adapter = getRelayAdapter(config);
    if (adapter.kind === 'gas') {
      const result = await adapter.sheetPush(payload, config);
      if (!result.ok) throw new Error(result.error ?? 'تعذّر الدفع إلى Google Sheets');
    }

    await this.commit((draft) => {
      draft.sheetMirror = payload; // نسخة اختبار مشفّرة محلياً أيضاً
      this.pushActivity(draft, {
        direction: 'out',
        type: 'sheetPush',
        label: `دفع ${payload.staff.length} عضو و${payload.meals.length} وجبة إلى Google Sheets`,
        ok: true,
      });
    });
    return payload;
  }

  /** سحب الكادر وترتيب الوجبات من Sheets وتحديث القاعدة المحلية المشفّرة. */
  async pullSheets(): Promise<AppState> {
    const snapshot = this.getSnapshot();
    const config = snapshot.relay;
    if (!config.spreadsheetId.trim()) throw new Error('أدخل معرّف أو اسم ملف Google Sheets أولاً');

    let incoming: SheetSnapshot | null = null;
    const adapter = getRelayAdapter(config);
    if (adapter.kind === 'gas') {
      incoming = await adapter.sheetPull(config);
    } else if (snapshot.sheetMirror) {
      incoming = {
        meals: snapshot.sheetMirror.meals,
        staff: snapshot.sheetMirror.staff,
        pulledAt: snapshot.sheetMirror.pushedAt,
      };
    }

    if (!incoming || !Array.isArray(incoming.meals) || !Array.isArray(incoming.staff)) {
      throw new Error(config.mode === 'gas'
        ? 'لم تُعد ورقتا Sheets بيانات صالحة بعد'
        : 'لا توجد نسخة محاكاة بعد؛ اضغط «دفع إلى Google Sheets» أولاً');
    }

    return this.commit((draft) => {
      this.applySheetSnapshot(draft, incoming!);
      this.pushActivity(draft, {
        direction: 'in',
        type: 'sheetPull',
        label: `سحب ${incoming!.staff.length} عضو و${incoming!.meals.length} وجبة من Google Sheets`,
        ok: true,
      });
    });
  }

  /** دمج بيانات الأوراق مع الحفاظ على المعرّفات المحلية وربط الرموز بالوجبات بالاسم. */
  private applySheetSnapshot(draft: AppState, incoming: SheetSnapshot): void {
    const incomingMeals = [...incoming.meals].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const meals = incomingMeals.map((sheetMeal, index) => {
      const existing = draft.meals.find(
        (meal) => meal.id === sheetMeal.id || meal.name.toLowerCase() === String(sheetMeal.name).toLowerCase(),
      );
      return {
        id: existing?.id ?? sheetMeal.id ?? newId('meal'),
        name: String(sheetMeal.name ?? '').trim() || existing?.name || `وجبة ${index + 1}`,
        label: String(sheetMeal.label ?? '') || existing?.label || '',
        order: typeof sheetMeal.order === 'number' ? sheetMeal.order : index,
      };
    }).sort((a, b) => a.order - b.order);
    draft.meals = meals;

    const mealById = new Map(meals.map((meal) => [meal.id, meal.id]));
    const mealByName = new Map(meals.map((meal) => [meal.name.toLowerCase(), meal.id]));
    const resolveMeal = (value: string): string | null =>
      mealById.get(value) ?? mealByName.get(String(value).toLowerCase()) ?? null;

    draft.staff = incoming.staff.map((sheetMember) => {
      const existing = draft.staff.find(
        (member) => member.id === sheetMember.id || member.name === sheetMember.name,
      );
      const mealIds = [...new Set(
        (sheetMember.mealIds ?? [])
          .map(resolveMeal)
          .filter((id): id is string => Boolean(id)),
      )];
      return {
        id: existing?.id ?? sheetMember.id ?? newId('staff'),
        name: String(sheetMember.name ?? '').trim() || existing?.name || 'بدون اسم',
        pinHash: sheetMember.pinHash || existing?.pinHash || '',
        pinEncrypted: sheetMember.pinEncrypted || existing?.pinEncrypted || '',
        mealIds,
        active: sheetMember.active ?? existing?.active ?? true,
        createdAt: sheetMember.createdAt || existing?.createdAt || new Date().toISOString(),
      };
    });

    const mealNames = new Map(meals.map((meal) => [meal.id, meal.name]));
    draft.reports.forEach((report) => {
      const name = mealNames.get(report.mealId);
      if (name) report.mealName = name;
    });
    draft.attachments.forEach((attachment) => {
      const name = mealNames.get(attachment.mealId);
      if (name) attachment.mealName = name;
    });
    new Set(draft.reports.map((report) => report.date)).forEach((date) => this.recomputeSequences(draft, date));
  }

  /** توقيع خفيف يحدد هل تغيّر السجل الأسبوعي منذ آخر إرسال للقطة. */
  private digestSignature(state: AppState): string {
    const tail = state.tasks
      .map((item) => `${item.id}:${item.status}:${item.completedAt ?? item.postponedAt ?? ''}`)
      .join('|');
    return [
      state.relay.adminEmail,
      state.reports.length,
      state.reports.at(-1)?.id ?? '',
      state.tasks.length,
      state.dayLogs.length,
      state.dayLogs.map((day) => `${day.date}:${day.attendance.join(',')}|${day.leave.join(',')}`).join(';'),
      tail,
    ].join('#');
  }

  /** لقطة مقروءة لأسبوع كامل تُرسل إلى GAS ليولّد منها PDF ويبعثه للبريد الإداري. */
  private buildWeeklyDigest(state: AppState): WeeklyDigest {
    const weekEnd = todayKey();
    const weekStart = shiftDateKey(weekEnd, -6);
    const inWeek = (date: string) => date >= weekStart && date <= weekEnd;
    return {
      generatedAt: new Date().toISOString(),
      adminEmail: state.relay.adminEmail || state.admin?.email || '',
      weekStart,
      weekEnd,
      reports: state.reports
        .filter((item) => inWeek(item.date))
        .sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence)
        .map((item) => ({
          date: item.date,
          mealName: item.mealName,
          authorName: item.authorName,
          content: item.content,
          systemKind: item.systemKind,
          taskTitle: item.taskTitle,
          postponedReason: item.postponedReason,
        })),
      tasks: state.tasks
        .filter((item) => inWeek(item.date))
        .map((item) => ({
          title: item.title,
          mealName: item.mealName,
          status: item.status,
          priority: item.priority,
          completedBy: item.completedBy,
          postponedReason: item.postponedReason,
          date: item.date,
        })),
      // أسماء الحضور والمجازين جاهزة للسكربت؛ التعليقات الجانبية لا تُضمَن هنا قصداً.
      days: state.dayLogs
        .filter((item) => inWeek(item.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({
          date: day.date,
          mealName: day.mealName,
          attendanceNames: day.attendance
            .map((id) => state.staff.find((member) => member.id === id)?.name ?? '')
            .filter(Boolean),
          leaveNames: day.leave
            .map((id) => state.staff.find((member) => member.id === id)?.name ?? '')
            .filter(Boolean),
        })),
    };
  }

  /**
   * دورة المزامنة الكاملة:
   *   1) إرسال كل رسائل صندوق الخروج المشفّرة.
   *   2) إرسال ACK لكل رسالة أُرسلت → الوسيط يحذفها فوراً.
   *   3) سحب أي رسائل قادمة، تطبيقها محلياً، ثم ACK لها أيضاً.
   */
  async sync(): Promise<AppState> {
    return this.withLock(async () => {
      const draft = structuredClone(this.getSnapshot());
      if (!draft.relay.enabled) return draft;

      const adapter = getRelayAdapter(draft.relay);

      // أضف لقطة أسبوعية واحدة فقط عند تغيّر السجل أو بريد المسؤول.
      const signature = this.digestSignature(draft);
      if (signature !== draft.relay.lastDigestSignature) {
        const digest = this.buildWeeklyDigest(draft);
        draft.outbox.push({
          id: newId('msg'),
          type: 'weeklyDigest',
          payload: await cryptoService.encrypt(JSON.stringify(digest)),
          digest,
          createdAt: new Date().toISOString(),
        });
        draft.relay.lastDigestSignature = signature;
      }

      const pending = [...draft.outbox];

      for (const message of pending) {
        const result = await adapter.push(message, draft.relay);
        const typeLabel = ACTIVITY_LABEL[message.type];
        if (!result.ok) {
          this.pushActivity(draft, { direction: 'out', type: message.type, label: `فشل إرسال ${typeLabel}`, ok: false });
          continue;
        }

        const ack = await adapter.ack(message.id, draft.relay);
        // سطر واحد يلخّص الإرسال والتأكيد والحذف بدل ثلاثة أسطر متقاربة.
        this.pushActivity(draft, {
          direction: 'out',
          type: message.type,
          label: ack.ok ? `إرسال ${typeLabel} · ACK · حذف من الوسيط` : `إرسال ${typeLabel} · تعذّر تأكيد الحذف`,
          ok: ack.ok,
        });
        if (ack.ok) draft.outbox = draft.outbox.filter((item) => item.id !== message.id);

        // نفك الحمولة لمعرفة معرّف التقرير الأصلي وتحديث حالة المزامنة.
        try {
          const original = JSON.parse(await cryptoService.decrypt(message.payload)) as { id?: string };
          const report = draft.reports.find((item) => item.id === original.id);
          if (report) report.synced = true;
        } catch {
          /* تجاهل: الرسائل غير المتعلقة بالتقارير لا تحتاج تحديث حالة */
        }
      }

      const incoming = await adapter.pull(draft.relay);
      for (const message of incoming) {
        try {
          const data = JSON.parse(await cryptoService.decrypt(message.payload)) as unknown;
          if (message.type === 'report') {
            const report = data as Report;
            if (!draft.reports.some((item) => item.id === report.id)) draft.reports.push(report);
          } else if (message.type === 'attachment') {
            const attachment = data as Attachment;
            if (!draft.attachments.some((item) => item.id === attachment.id)) {
              draft.attachments.push(attachment);
            }
          } else if (message.type === 'task') {
            const task = data as MealTask;
            const index = draft.tasks.findIndex((item) => item.id === task.id);
            if (index < 0) {
              draft.tasks.push(task);
            } else {
              const localTime = draft.tasks[index].completedAt ?? draft.tasks[index].postponedAt ?? draft.tasks[index].createdAt;
              const incomingTime = task.completedAt ?? task.postponedAt ?? task.createdAt;
              if (incomingTime > localTime) draft.tasks[index] = task;
            }
          } else if (message.type === 'broadcast') {
            const cast = data as Broadcast;
            draft.broadcast = cast.message ? cast : null;
          } else if (message.type === 'approval') {
            const approval = data as DayApproval;
            draft.approvals = [...draft.approvals.filter((item) => item.date !== approval.date), approval];
          } else if (message.type === 'schedule') {
            const schedule = data as DaySchedule;
            draft.schedules = [...draft.schedules.filter((item) => item.date !== schedule.date), schedule];
          } else if (message.type === 'dayLog') {
            const day = data as DayLog;
            draft.dayLogs = [...draft.dayLogs.filter((item) => item.date !== day.date), day];
          } else if (message.type === 'comment') {
            const comment = data as DayLogComment;
            if (!draft.comments.some((item) => item.id === comment.id)) draft.comments.push(comment);
          }
          // weeklyDigest يُarchive في GAS ولا يحتاج تطبيقاً محلياً.
          const ack = await adapter.ack(message.id, draft.relay);
          this.pushActivity(draft, {
            direction: 'in',
            type: message.type,
            label: ack.ok
              ? `استلام ${ACTIVITY_LABEL[message.type]} · ACK · حذف من الوسيط`
              : `استلام ${ACTIVITY_LABEL[message.type]} · تحذير حذف`,
            ok: ack.ok,
          });
        } catch (error) {
          console.error('[Repository] فشل معالجة رسالة واردة:', error);
        }
      }

      draft.activity = draft.activity.slice(0, 40);
      draft.relay.lastSyncAt = new Date().toISOString();
      await stateStorage.save(draft);
      this.state = draft;
      this.emit();
      return draft;
    });
  }

  /** إفراغ سجل نشاط الوسيط مع الإبقاء على كل البيانات الأخرى. */
  async clearActivity(): Promise<AppState> {
    return this.commit((draft) => {
      draft.activity = [];
    });
  }

  /** إعادة ضبط كاملة للنسخة التجريبية. */
  async resetAll(): Promise<AppState> {
    return this.commit((draft) => {
      Object.assign(draft, createDefaultState());
    });
  }
}

export const repository = new Repository();
