/** الهيكل العام للتطبيق: شريط تنقّل جانبي + منطقة محتوى. */
import { useState, type ReactNode } from 'react';
import type { Session } from '@/domain/types';
import { useApp } from '@/state/AppContext';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export function Shell({
  nav,
  active,
  onNavigate,
  currentUser,
  onSignOut,
  syncing,
  children,
}: {
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  currentUser: Session;
  onSignOut: () => void;
  syncing: boolean;
  children: ReactNode;
}) {
  // على الشاشات الصغيرة تُخفى القائمة افتراضياً؛ هذا الزر يفتحها ويغلقها.
  const [navOpen, setNavOpen] = useState(false);
  const navigate = (id: string) => {
    onNavigate(id);
    setNavOpen(false);
  };
  const roleLabel = currentUser.role === 'admin' ? 'لوحة المسؤول' : 'لوحة الكادر';
  const { state } = useApp();

  return (
    <div className="app-shell">
      <div className="mobile-bar">
        <div className="brand">
          <div className="brand-mark">س</div>
          <div>
            <div className="brand-name">السجل الإلكتروني</div>
            <div className="brand-sub">{roleLabel}</div>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="main-sidebar"
        >
          <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
          {navOpen ? 'إغلاق القائمة' : 'القائمة'}
        </button>
      </div>

      <aside id="main-sidebar" className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">س</div>
          <div>
            <div className="brand-name">السجل الإلكتروني</div>
            <div className="brand-sub">{roleLabel}</div>
          </div>
        </div>

        <div>
          <div className="nav-group-label">القائمة الرئيسية</div>
          <nav className="nav" aria-label="التنقّل الرئيسي">
            {nav.map((item) => (
              <button
                key={item.id}
                className={`nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => navigate(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer stack">
          <div className="user-chip">
            <div className="avatar">{currentUser.name.charAt(0)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 600 }}>{currentUser.name}</div>
              <div className="tiny muted">{currentUser.role === 'admin' ? 'مسؤول' : 'كادر'}</div>
            </div>
          </div>
          <div className="tiny muted" style={{ paddingInlineStart: 'var(--s2)' }}>
            {syncing ? 'جارٍ مزامنة التحديثات…' : 'التخزين المحلي مشفّر ✓'}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>تسجيل الخروج</button>
        </div>
      </aside>
      <main className="main">
        {state.broadcast?.message && (
          <div className="broadcast-banner" role="alert">
            <span aria-hidden="true">📢</span>
            <div>
              <strong>تنبيه إداري عاجل</strong>
              <div>{state.broadcast.message}</div>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function PageHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
