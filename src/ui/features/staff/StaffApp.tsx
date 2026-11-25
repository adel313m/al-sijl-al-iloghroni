/** لوحة الكادر: كتابة التقرير، عرض السجل اليومي، تصفح المكتبة. */
import { useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Shell, PageHead, type NavItem } from '@/ui/components/Shell';
import { MediaLibrary } from '@/ui/features/media/MediaLibrary';
import { ReportsFeed } from '@/ui/features/reports/ReportsFeed';
import { ReportComposer } from './ReportComposer';
import { StaffTaskAlert, TaskPanel } from './TaskPanel';

const NAV: NavItem[] = [
  { id: 'compose', label: 'تقريري اليومي', icon: '✎' },
  { id: 'tasks', label: 'مهام الوجبة', icon: '✔' },
  { id: 'log', label: 'السجل اليومي الموحّد', icon: '☰' },
  { id: 'media', label: 'مكتبة الوسائط', icon: '▣' },
];

const TITLES: Record<string, { title: string; description: string }> = {
  compose: { title: 'تقريري اليومي', description: 'اكتب تقريرك وأرفق ما يهمّ؛ سيُنسب تلقائياً إلى اسمك ووجبتك ووقتك.' },
  tasks: { title: 'مهام الوجبة', description: 'مهام المسؤول لوجبتك: أتمّها أو أجّلها ليسجّلا تلقائياً في السجل اليومي.' },
  log: { title: 'السجل اليومي الموحّد', description: 'بطاقة واحدة لليوم والوجبة المناوبة: الأعمال، المهام، الحضور والمجازين، والتعليقات الجانبية.' },
  media: { title: 'مكتبة الوسائط', description: 'تصفّح كل النصوص والصور وملفات PDF المصنّفة حسب الوجبة والتاريخ.' },
};

export function StaffApp() {
  const { currentUser, actions, syncing } = useApp();
  const [route, setRoute] = useState('compose');
  const meta = TITLES[route] ?? TITLES.compose;

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
      <StaffTaskAlert />
      {route === 'compose' && <ReportComposer />}
      {route === 'tasks' && <TaskPanel />}
      {route === 'log' && <ReportsFeed />}
      {route === 'media' && <MediaLibrary />}
    </Shell>
  );
}
