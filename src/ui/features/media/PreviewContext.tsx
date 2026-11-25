/** سياق معاينة المرفقات — يتيح فتح أي مرفق من أي شاشة بنفس النافذة. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Attachment } from '@/domain/types';
import { dataUrlToText } from '@/utils/file';
import { Modal } from '@/ui/components/ui';

interface PreviewValue { open: (attachment: Attachment) => void }
const PreviewContext = createContext<PreviewValue>({ open: () => {} });

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Attachment | null>(null);
  const value = useMemo<PreviewValue>(() => ({ open: setCurrent }), []);

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {current && (
        <Modal title={current.name} onClose={() => setCurrent(null)} wide>
          {current.kind === 'image' && (
            <img src={current.dataUrl} alt={current.name} style={{ maxWidth: '100%', display: 'block', margin: 'auto' }} />
          )}
          {current.kind === 'pdf' && (
            <iframe
              src={current.dataUrl}
              title={current.name}
              style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
            />
          )}
          {current.kind === 'text' && (
            <pre className="text-preview">{dataUrlToText(current.dataUrl)}</pre>
          )}
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            {current.mealName} · {current.date} · {(current.size / 1024).toFixed(1)} كيلوبايت
          </p>
        </Modal>
      )}
    </PreviewContext.Provider>
  );
}

export const usePreview = () => useContext(PreviewContext);
