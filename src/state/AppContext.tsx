/**
 * طبقة الحالة (State Container)
 * ------------------------------
 * تربط المستودع بواجهة React دون أن يعرف المستودع بـ React.
 * أي مكوّن يستخدم useApp() يحصل على الحالة + الإجراءات + حالة التحميل.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppState, DayApproval, DayLogComment, EmailVerification, MealTask, Report, Session } from '@/domain/types';
import { createDefaultState } from '@/domain/defaults';
import {
  repository,
  type NewAttachmentInput,
  type NewReportInput,
  type NewStaffInput,
  type NewTaskInput,
} from '@/services/repository';
import { session } from '@/services/session';
import { requestBackgroundSync } from '@/services/pwa';

interface AppContextValue {
  state: AppState;
  currentUser: Session | null;
  loading: boolean;
  syncing: boolean;
  actions: {
    setupAdmin(email: string, password: string | null, googleLinked: boolean, verified: boolean): Promise<void>;
    requestEmailVerification(email: string, purpose: EmailVerification['purpose']): Promise<string>;
    verifyEmailCode(email: string, code: string): Promise<boolean>;
    completeAdminSetup(email: string, password: string | null, googleLinked: boolean, code: string): Promise<void>;
    confirmAdminEmail(email: string, code: string): Promise<void>;
    verifyAdminPassword(password: string): Promise<boolean>;
    pushSheets(): Promise<void>;
    pullSheets(): Promise<void>;
    verifyStaffPin(staffId: string, pin: string): Promise<boolean>;
    revealStaffPin(staffId: string): Promise<string>;
    addMeal(name: string, label: string): Promise<void>;
    updateMeal(id: string, patch: { name?: string; label?: string }): Promise<void>;
    removeMeal(id: string): Promise<void>;
    reorderMeals(ids: string[]): Promise<void>;
    addStaff(input: NewStaffInput): Promise<void>;
    updateStaff(id: string, patch: { name?: string; mealIds?: string[]; active?: boolean; pin?: string }): Promise<void>;
    moveStaff(id: string, fromMealId: string, toMealId: string): Promise<void>;
    removeStaff(id: string): Promise<void>;
    addReport(input: NewReportInput, actor?: Session): Promise<Report>;
    updateReport(reportId: string, content: string, actor?: Session): Promise<void>;
    addAttachment(input: NewAttachmentInput, actor?: Session): Promise<void>;
    removeAttachment(id: string): Promise<void>;
    setDaySchedule(date: string, mealId: string): Promise<void>;
    setDayLog(date: string, patch: { attendance: string[]; leave: string[] }, actor: Session): Promise<void>;
    addComment(date: string, content: string, actor: Session): Promise<DayLogComment>;
    removeComment(commentId: string, actor: Session): Promise<void>;
    assignTask(input: NewTaskInput): Promise<MealTask>;
    completeTask(taskId: string, memberId: string, memberName: string): Promise<void>;
    postponeTask(taskId: string, memberId: string, memberName: string, reason: string): Promise<void>;
    reassignTask(taskId: string, mealId: string): Promise<void>;
    publishBroadcast(message: string, createdBy: string): Promise<void>;
    clearBroadcast(createdBy: string): Promise<void>;
    approveDay(date: string, approvedBy: string): Promise<DayApproval>;
    updateRelayConfig(patch: Partial<AppState['relay']>): Promise<void>;
    clearActivity(): Promise<void>;
    sync(): Promise<void>;
    resetAll(): Promise<void>;
    signIn(value: Session): void;
    signOut(): void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(createDefaultState);
  const [currentUser, setCurrentUser] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([repository.init(), session.get()]).then(([loaded, savedSession]) => {
      if (!mounted) return;
      setState(loaded);
      setCurrentUser(savedSession);
      setLoading(false);
    });
    const unsubscribe = repository.subscribe((next) => setState(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (value: Session) => {
    await session.set(value);
    setCurrentUser(value);
  }, []);

  const signOut = useCallback(async () => {
    await session.clear();
    setCurrentUser(null);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await repository.sync();
    } finally {
      setSyncing(false);
    }
  }, []);

  // استمرارية الاتصال: مزامنة فورية عند عودة الشبكة أو طلب من Service Worker.
  useEffect(() => {
    const onOnline = () => { void sync(); };
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SIJL_SYNC_NOW') void sync();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void sync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [sync]);

  // أي رسالة معلّقة تُسجَّل أيضاً كـ Background Sync ليعيد الـ SW محاولة الإرسال.
  useEffect(() => {
    if (state.outbox.length > 0 && navigator.onLine) void requestBackgroundSync();
  }, [state.outbox.length]);

  const actions = useMemo<AppContextValue['actions']>(
    () => ({
      setupAdmin: async (email, password, googleLinked, verified) => {
        await repository.setupAdmin(email, password, googleLinked, verified);
      },
      requestEmailVerification: (email, purpose) => repository.requestEmailVerification(email, purpose),
      verifyEmailCode: (email, code) => repository.verifyEmailCode(email, code),
      completeAdminSetup: async (email, password, googleLinked, code) => {
        await repository.completeAdminSetup(email, password, googleLinked, code);
      },
      confirmAdminEmail: async (email, code) => {
        await repository.confirmAdminEmail(email, code);
      },
      verifyAdminPassword: (password) => repository.verifyAdminPassword(password),
      pushSheets: async () => {
        await repository.pushSheets();
        void sync();
      },
      pullSheets: async () => {
        await repository.pullSheets();
        void sync();
      },
      verifyStaffPin: (staffId, pin) => repository.verifyStaffPin(staffId, pin),
      revealStaffPin: (staffId) => repository.revealStaffPin(staffId),
      addMeal: async (name, label) => {
        await repository.addMeal(name, label);
      },
      updateMeal: async (id, patch) => {
        await repository.updateMeal(id, patch);
      },
      removeMeal: async (id) => {
        await repository.removeMeal(id);
      },
      reorderMeals: async (ids) => {
        await repository.reorderMeals(ids);
      },
      addStaff: async (input) => {
        await repository.addStaff(input);
      },
      updateStaff: async (id, patch) => {
        await repository.updateStaff(id, patch);
      },
      moveStaff: async (id, from, to) => {
        await repository.moveStaff(id, from, to);
      },
      removeStaff: async (id) => {
        await repository.removeStaff(id);
      },
      addReport: async (input, actor) => {
        const report = await repository.addReport(input, actor ?? currentUser ?? undefined);
        void sync(); // مزامنة تلقائية غير حاجزة للواجهة
        return report;
      },
      updateReport: async (reportId, content, actor) => {
        await repository.updateReport(reportId, { content }, actor ?? currentUser ?? undefined);
        void sync();
      },
      addAttachment: async (input, actor) => {
        await repository.addAttachment(input, actor ?? currentUser ?? undefined);
        void sync();
      },
      removeAttachment: async (id) => {
        await repository.removeAttachment(id);
      },
      setDaySchedule: async (date, mealId) => {
        await repository.setDaySchedule(date, mealId);
        void sync();
      },
      setDayLog: async (date, patch, actor) => {
        await repository.setDayLog(date, patch, actor);
        void sync();
      },
      addComment: async (date, content, actor) => {
        const entry = await repository.addComment(date, content, actor);
        void sync();
        return entry;
      },
      removeComment: async (commentId, actor) => {
        await repository.removeComment(commentId, actor);
        void sync();
      },
      assignTask: async (input) => {
        const task = await repository.assignTask(input);
        void sync();
        return task;
      },
      completeTask: async (taskId, memberId, memberName) => {
        await repository.completeTask(taskId, memberId, memberName, currentUser ?? undefined);
        void sync();
      },
      postponeTask: async (taskId, memberId, memberName, reason) => {
        await repository.postponeTask(taskId, memberId, memberName, reason, currentUser ?? undefined);
        void sync();
      },
      reassignTask: async (taskId, mealId) => {
        await repository.reassignTask(taskId, mealId);
        void sync();
      },
      publishBroadcast: async (message, createdBy) => {
        await repository.publishBroadcast(message, createdBy);
        void sync();
      },
      clearBroadcast: async (createdBy) => {
        await repository.clearBroadcast(createdBy);
        void sync();
      },
      approveDay: async (date, approvedBy) => {
        const approval = await repository.approveDay(date, approvedBy);
        void sync();
        return approval;
      },
      updateRelayConfig: async (patch) => {
        await repository.updateRelayConfig(patch);
      },
      clearActivity: async () => {
        await repository.clearActivity();
      },
      sync,
      resetAll: async () => {
        await repository.resetAll();
        signOut();
      },
      signIn,
      signOut,
    }),
    [currentUser, signIn, signOut, sync],
  );

  const value = useMemo<AppContextValue>(
    () => ({ state, currentUser, loading, syncing, actions }),
    [state, currentUser, loading, syncing, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp يجب أن يُستخدم داخل AppProvider');
  return context;
}
