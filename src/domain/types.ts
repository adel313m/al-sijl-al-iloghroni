/**
 * طبقة النطاق (Domain): تعريفات الكيانات فقط، دون أي منطق تخزين أو واجهة.
 * أي ميزة جديدة في المراحل القادمة تبدأ بإضافة نوع هنا ثم تتوسع للطبقات الأخرى.
 */

/** وجبة/مناوبة (Morning، A، B، C، D ...). الترتيب يحدد ترتيب التتابع اليومي. */
export interface Meal {
  id: string;
  name: string; // الاسم المعروض: "Morning"، "A"، ...
  label: string; // وصف عربي اختياري: "الوجبة الصباحية"، ...
  order: number; // 0 => أول وجبة في التتابع
}

/** عضو الكادر. يُربط بواحدة أو أكثر من الوجبات. */
export interface StaffMember {
  id: string;
  name: string;
  pinHash: string; // تجزئة PBKDF2 تُستخدم للتحقق عند الدخول
  pinEncrypted: string; // نسخة قابلة لفك التشفير ليعرضها المسؤول في بلوك الوجبة
  mealIds: string[];
  active: boolean;
  createdAt: string;
}

/** حساب المسؤول (بريد + كلمة مرور مجزّأة، أو دخول Google محاكى). */
export interface AdminAccount {
  email: string; // بريد Gmail رسمي مؤكَّد
  passwordHash: string | null; // null يعني الدخول عبر Google (محاكاة)
  googleLinked: boolean;
  emailVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

/** رمز تأكيد مؤقت للبريد الإداري (يُحفظ مشفّراً داخل حالة التطبيق). */
export interface EmailVerification {
  email: string;
  code: string;
  purpose: 'setup' | 'reverify' | 'change';
  createdAt: string;
  expiresAt: string;
}

export type AttachmentKind = 'text' | 'image' | 'pdf';

/** مرفق داخل تقرير: نص أو صورة أو PDF. البيانات تُحفظ مشفرة داخل التخزين. */
export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  dataUrl: string; // data:...;base64 — مشفّر على مستوى التخزين
  mealId: string;
  mealName: string;
  reportId: string | null; // null يعني مرفق مستودع مستقل أُضيف بالرفع السريع
  date: string; // YYYY-MM-DD
  uploadedAt: string;
}

/** تقرير يومي منسوب لعضو ووجبة وتاريخ وترتيب تتابع. */
export interface Report {
  id: string;
  authorId: string;
  authorName: string;
  mealId: string;
  mealName: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO datetime
  sequence: number; // ترتيب التقرير داخل اليوم (حسب ترتيب الوجبة ثم الوقت)
  content: string;
  attachmentIds: string[];
  synced: boolean;
  // مهام النظام تُضاف تلقائياً إلى السجل عند الإتمام أو التأجيل
  systemKind?: 'task-done' | 'task-postponed';
  taskId?: string;
  taskTitle?: string;
  postponedReason?: string;
}

export type TaskPriority = 'normal' | 'urgent';
export type TaskStatus = 'new' | 'done' | 'postponed';

/** مهمة يُسندها المسؤول إلى وجبة اليوم. */
export interface MealTask {
  id: string;
  title: string;
  details: string;
  priority: TaskPriority;
  mealId: string;
  mealName: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  createdBy: string;
  status: TaskStatus;
  completedBy?: string;
  completedAt?: string;
  postponedReason?: string;
  postponedAt?: string;
  postponedBy?: string;
  reassignedToMealId?: string;
}

/** جدول مناوبة يوم واحد — يحدد الوجبة العاملة تلقائياً. */
export interface DaySchedule {
  date: string;
  mealId: string;
  mealName: string;
  updatedAt: string;
}

/** سجل اليوم الموحّد: يوم واحد + الوجبة المناوبة + الحضور والمجازين. */
export interface DayLog {
  date: string;
  mealId: string;
  mealName: string;
  attendance: string[]; // معرّفات أعضاء الوجبة الحاضرين
  leave: string[]; // معرّفات أعضاء الوجبة المجازين
  updatedAt: string;
  updatedBy: string;
}

/** تعليق جانبي غير رسمي: يظهر في الواجهة فقط ولا يُضمَن PDF أبداً. */
export interface DayLogComment {
  id: string;
  date: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

/** تنبيه إداري عاجل يظهر أعلى كل الشاشات. */
export interface Broadcast {
  id: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

/** ختم اعتماد المسؤول على سجل يوم كامل. */
export interface DayApproval {
  date: string;
  approvedAt: string;
  approvedBy: string;
}

/** لقطة أسبوعية مقروءة تُرسل إلى GAS لتوليد الـ PDF البريدي.
 *  البيانات المحلية تبقى مشفّرة بالكامل؛ هذه اللقطة تُستخدم فقط داخل السكربت. */
export interface WeeklyDigest {
  generatedAt: string;
  adminEmail: string;
  weekStart: string;
  weekEnd: string;
  reports: Array<{
    date: string;
    mealName: string;
    authorName: string;
    content: string;
    systemKind?: Report['systemKind'];
    taskTitle?: string;
    postponedReason?: string;
  }>;
  tasks: Array<{
    title: string;
    mealName: string;
    status: TaskStatus;
    priority: TaskPriority;
    completedBy?: string;
    postponedReason?: string;
    date: string;
  }>;
  days: Array<{
    date: string;
    mealName: string;
    attendanceNames: string[];
    leaveNames: string[];
  }>;
}

/** إعدادات الوسيط (Google Apps Script أو محاكاة محلية). */
export interface RelayConfig {
  mode: 'simulation' | 'gas';
  gasUrl: string;
  token: string; // سر مشترك اختياري يطابق SECRET_TOKEN في السكربت
  enabled: boolean;
  lastSyncAt: string | null;
  adminEmail: string; // بريد المسؤول المؤكَّد — وجهة التقرير الأسبوعي PDF
  lastDigestSignature: string; // لتجنب إرسال لقطة أسبوعية جديدة في كل مزامنة
  spreadsheetId: string; // معرّف أو اسم ملف Google Sheets المرجعي
  staffSheet: string; // اسم ورقة الكادر، مثل: Staff_Directory
  shiftsSheet: string; // اسم ورقة ترتيب الوجبات، مثل: Shifts_Order
}

/** نسخة الكادر والوجبات المرسلة إلى Sheets. الرموز تُرسل مجزّأة/مشفّرة فقط. */
export interface SheetSyncPayload {
  spreadsheetId: string;
  staffSheet: string;
  shiftsSheet: string;
  adminEmail: string;
  meals: Meal[];
  staff: StaffMember[];
  pushedAt: string;
}

/** ما تُعيده ورقتا Sheets إلى الجهاز عند السحب. */
export interface SheetSnapshot {
  meals: Meal[];
  staff: StaffMember[];
  pulledAt: string;
}

/** رسالة تنتقل عبر الوسيط. الحمولة (payload) مشفّرة قبل الإرسال. */
export interface RelayMessage {
  id: string;
  type: 'report' | 'attachment' | 'settings' | 'task' | 'broadcast' | 'approval' | 'schedule' | 'dayLog' | 'comment' | 'weeklyDigest';
  payload: string; // نص مشفّر (AES-GCM)
  createdAt: string;
  // اللقطة الأسبوعية وحدها تُرفق مقروءة ليتمكن GAS من توليد PDF البريد.
  digest?: WeeklyDigest;
}

export interface ActivityEntry {
  id: string;
  at: string;
  direction: 'out' | 'in';
  type: RelayMessage['type'] | 'ack' | 'sheetPush' | 'sheetPull' | 'emailVerify';
  label: string;
  ok: boolean;
  count?: number; // عدد العمليات المطابقة المدمجة في هذا السطر لتقليل التكرار
}

/** حالة التطبيق الكاملة — تُحفظ كمُشفّرة (blob واحد) عبر Storage Adapter. */
export interface AppState {
  version: number;
  initialized: boolean;
  admin: AdminAccount | null;
  meals: Meal[];
  staff: StaffMember[];
  reports: Report[];
  attachments: Attachment[];
  tasks: MealTask[];
  schedules: DaySchedule[];
  dayLogs: DayLog[];
  comments: DayLogComment[];
  broadcast: Broadcast | null;
  approvals: DayApproval[];
  pendingVerification: EmailVerification | null;
  sheetMirror: SheetSyncPayload | null; // نسخة محاكاة محلية للسحب/الدفع بدون GAS
  relay: RelayConfig;
  outbox: RelayMessage[];
  activity: ActivityEntry[];
}

/** جلسة المستخدم الحالية — تُحفظ مشفّرة في localStorage ولا تنتهي تلقائياً. */
export interface Session {
  role: 'admin' | 'staff';
  id: string;
  name: string;
}

/** مدخلات إنشاء رسالة وسيط جديدة. */
export type RelayEventInput =
  | { type: 'report'; data: Report }
  | { type: 'attachment'; data: Attachment }
  | { type: 'settings'; data: { meals: Meal[]; staff: StaffMember[]; relay: RelayConfig } }
  | { type: 'task'; data: MealTask }
  | { type: 'broadcast'; data: Broadcast }
  | { type: 'approval'; data: DayApproval }
  | { type: 'schedule'; data: DaySchedule }
  | { type: 'dayLog'; data: DayLog }
  | { type: 'comment'; data: DayLogComment }
  | { type: 'weeklyDigest'; data: WeeklyDigest };
