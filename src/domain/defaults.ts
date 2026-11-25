import type { AppState, Meal } from './types';

/** الوجبات الافتراضية. يمكن للمسؤول تعديل العدد والترتيب والاسم من الإعدادات. */
export const DEFAULT_MEALS: Meal[] = [
  { id: 'meal-morning', name: 'Morning', label: 'الكادر الصباحي', order: 0 },
  { id: 'meal-a', name: 'A', label: 'الوجبة A', order: 1 },
  { id: 'meal-b', name: 'B', label: 'الوجبة B', order: 2 },
  { id: 'meal-c', name: 'C', label: 'الوجبة C', order: 3 },
  { id: 'meal-d', name: 'D', label: 'الوجبة D', order: 4 },
];

export function createDefaultState(): AppState {
  return {
    version: 4,
    initialized: false,
    admin: null,
    meals: DEFAULT_MEALS.map((m) => ({ ...m })),
    staff: [],
    reports: [],
    attachments: [],
    tasks: [],
    schedules: [],
    dayLogs: [],
    comments: [],
    broadcast: null,
    approvals: [],
    pendingVerification: null,
    sheetMirror: null,
    relay: {
      mode: 'simulation',
      gasUrl: '',
      token: '',
      enabled: true,
      lastSyncAt: null,
      adminEmail: '',
      lastDigestSignature: '',
      spreadsheetId: '',
      staffSheet: 'Staff_Directory',
      shiftsSheet: 'Shifts_Order',
    },
    outbox: [],
    activity: [],
  };
}

/**
 * ترقية حالة قديمة مخزّنة محلياً إلى الشكل الحالي دون فقدان البيانات.
 * هذا مهم لأن إضافة كيانات جديدة لا يجب أن تُجبر المستخدم على إعادة الضبط.
 */
export function migrateState(loaded: Partial<AppState> | null): AppState {
  const base = createDefaultState();
  if (!loaded) return base;
  return {
    ...base,
    ...loaded,
    version: base.version,
    // الحالات القديمة كان بريدها يُعتبر مؤكَّداً ضمنياً؛ نحافظ على دخولها ونطلب تغييره إلى Gmail من الإعدادات.
    admin: loaded.admin
      ? {
          ...loaded.admin,
          emailVerified: loaded.admin.emailVerified ?? true,
          verifiedAt: loaded.admin.verifiedAt ?? loaded.admin.createdAt,
        }
      : null,
    meals: loaded.meals?.length ? loaded.meals : base.meals,
    staff: loaded.staff ?? [],
    reports: loaded.reports ?? [],
    attachments: loaded.attachments ?? [],
    tasks: loaded.tasks ?? [],
    schedules: loaded.schedules ?? [],
    dayLogs: loaded.dayLogs ?? [],
    comments: loaded.comments ?? [],
    broadcast: loaded.broadcast ?? null,
    approvals: loaded.approvals ?? [],
    pendingVerification: loaded.pendingVerification ?? null,
    sheetMirror: loaded.sheetMirror ?? null,
    relay: { ...base.relay, ...(loaded.relay ?? {}) },
    outbox: loaded.outbox ?? [],
    activity: loaded.activity ?? [],
  };
}
