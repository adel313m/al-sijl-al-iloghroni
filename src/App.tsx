/** نقطة الدخول للتطبيق: مزوّدو السياقات + بوابة الدخول + اختيار اللوحة. */
import { useEffect } from 'react';
import { AppProvider, useApp } from '@/state/AppContext';
import { LoadingCards, ToastProvider } from '@/ui/components/ui';
import { PreviewProvider } from '@/ui/features/media/PreviewContext';
import { LoginPage } from '@/ui/features/auth/LoginPage';
import { AdminApp } from '@/ui/features/admin/AdminApp';
import { StaffApp } from '@/ui/features/staff/StaffApp';

/** مزامنة خفيفة عند فتح التطبيق لسحب أي تحديثات معلّقة في الوسيط. */
function StartupSync() {
  const { loading, actions } = useApp();
  useEffect(() => {
    if (!loading) void actions.sync();
  }, [loading, actions]);
  return null;
}

function Router() {
  const { loading, currentUser } = useApp();

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <LoadingCards count={4} />
      </div>
    );
  }
  if (!currentUser) return <LoginPage />;
  return currentUser.role === 'admin' ? <AdminApp /> : <StaffApp />;
}

export default function App() {
  return (
    <ToastProvider>
      <PreviewProvider>
        <AppProvider>
          <StartupSync />
          <Router />
        </AppProvider>
      </PreviewProvider>
    </ToastProvider>
  );
}
