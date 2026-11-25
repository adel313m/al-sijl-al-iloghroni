/** لوحة المسؤول: نظرة عامة + إدارة الوجبات والكادر والتقارير والمكتبة والوسيط. */
import { useState } from 'react';
import { availableDates, reportsForDate } from '@/domain/selectors';
import { formatDateAr, todayKey } from '@/utils/date';
import { useApp } from '@/state/AppContext';
import { Shell, PageHead, type NavItem } from '@/ui/components/Shell';
import { MediaLibrary } from '@/ui/features/media/MediaLibrary';
import { ReportsFeed } from '@/ui/features/reports/ReportsFeed';
import { MealsSettings } from './MealsSettings';
import { StaffManagement } from './StaffManagement';
import { RelaySettings } from './RelaySettings';
import { TaskAssignment } from './TaskAssignment';
import { AdminControls } from './AdminControls';

const NAV: NavItem[] = [
  { id: 'overview', label: 'نظرة عامة', icon: '▦' },
  { id: 'meals', label: 'الوجبات', icon: '▤' },
  { id: 'staff', label: 'إدارة الكادر', icon: '◉' },
  { id: 'tasks', label: 'إسناد المهام', icon: '✔' },
  { id: 'operations', label: 'متابعة وإدارة', icon: '⚑' },
  { id: 'reports', label: 'التقارير والسجل اليومي', icon: '☰' },
  { id: 'media', label: 'مكتبة الوسائط', icon: '▣' },
  { id: 'settings', label: 'الوسيط والإعدادات', icon: '⚙' },
];

const TITLES: Record<string, { title: string; description: string }> = {
  overview: { title: 'نظرة عامة', description: 'ملخص سريع عن حالة السجل على هذا الجهاز.' },
  meals: { title: 'إعدادات الوجبات', description: 'حدّد عدد الوجبات وأسماءها وترتيب التتابع اليومي.' },
  staff: { title: 'إدارة الكادر', description: 'بلوك مستقل لكل وجبة: الأعضاء، الرموز، والنقل بين الوجبات.' },
  tasks: { title: 'إسناد المهام للوجبات', description: 'حدد الوجبة العاملة وأرسل مهاماً وتنبيهات فورية لأعضائها.' },
  operations: { title: 'المتابعة والإدارة', description: 'المهام المؤجلة، اعتماد السجل، التنبيه العام، وتصدير PDF.' },
  reports: { title: 'السجل اليومي الموحّد', description: 'بطاقة واحدة لليوم والوجبة المناوبة: الأعمال، المهام، الحضور والمجازين، والتعليقات الجانبية.' },
  media: { title: 'مكتبة الوسائط', description: 'نصوص وصور وملفات PDF مصنّفة حسب الوجبة والتاريخ والنوع.' },
  settings: { title: 'الوسيط والإعدادات', description: 'ربط Google Apps Script بالمزامنة وإعادة الضبط.' },
};

export function AdminApp() {
  const { currentUser, actions, syncing } = useApp();
  const [route, setRoute] = useState('overview');
  const meta = TITLES[route] ?? TITLES.overview;

  return (
    <Shell
      nav={NAV}
      active={route}
      onNavigate={setRoute}
      currentUser={currentUser!}
      onSignOut={actions.signOut}
      syncing={syncing}
    >
      <PageHead title={meta.title} description={meta.description} />

      {route === 'overview' && <Overview onNavigate={setRoute} />}
      {route === 'meals' && <MealsSettings />}
      {route === 'staff' && <StaffManagement />}
      {route === 'tasks' && <TaskAssignment />}
      {route === 'operations' && <AdminControls />}
      {route === 'reports' && <ReportsFeed />}
      {route === 'media' && <MediaLibrary canDelete />}
      {route === 'settings' && <RelaySettings />}
    </Shell>
  );
}

function Overview({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { state } = useApp();
  const today = todayKey();
  const todayReports = reportsForDate(state, today);
  const dates = availableDates(state);
  const staffCount = state.staff.filter((member) => member.active).length;

  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="card stat"><div className="stat-label">الوجبات</div><div className="stat-value">{state.meals.length}</div></div>
        <div className="card stat"><div className="stat-label">الكادر الفعّال</div><div className="stat-value">{staffCount}</div></div>
        <div className="card stat"><div className="stat-label">تقارير اليوم</div><div className="stat-value">{todayReports.length}</div></div>
        <div className="card stat"><div className="stat-label">الملفات في المستودع</div><div className="stat-value">{state.attachments.length}</div></div>
      </div>

      <div className="card card-pad stack">
        <h2 style={{ margin: 0 }}>ابدأ من هنا</h2>
        <div className="grid grid-3">
          <button className="btn btn-secondary" onClick={() => onNavigate('meals')}>1 · رتّب الوجبات</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('staff')}>2 · أضف الكادر واربطه بالوجبات</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('tasks')}>3 · حدد وجبة اليوم وأرسل مهمة</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('operations')}>4 · تابع المهام وصدّر PDF</button>
          <button className="btn btn-secondary" onClick={() => onNavigate('settings')}>5 · اربط الوسيط (اختياري)</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>آخر الأيام نشاطاً</h2></div>
        <div className="card-body">
          {dates.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>لا توجد تقارير بعد. سيظهر هنا أول يوم يُسجّل فيه الكادر تقاريره.</p>
          ) : (
            <div className="row">
              {dates.slice(0, 6).map((date) => (
                <button key={date} className="btn btn-secondary btn-sm" onClick={() => onNavigate('reports')}>
                  {formatDateAr(date)} · {reportsForDate(state, date).length} تقارير
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
