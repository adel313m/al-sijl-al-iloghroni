/** مكوّنات واجهة مشتركة ومحايدة — لا تعرف شيئاً عن بيانات التطبيق. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className={`card modal${wide ? ' modal-wide' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  glyph = '📋',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  glyph?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-glyph" aria-hidden="true">{glyph}</div>
      <h3>{title}</h3>
      <p className="small">{description}</p>
      {action}
    </div>
  );
}

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'warning';
  children: ReactNode;
}) {
  return <div className={`banner banner-${kind}`} role="status">{children}</div>;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="form-label">{label}</label>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

type ToastKind = 'info' | 'error';
interface ToastValue { message: string; kind: ToastKind }
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** إشعار خفيف للنجاح/الفشل — لا يُستخدم وحده لتأكيد العمليات الخطيرة. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastValue | null>(null);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast${toast.kind === 'error' ? ' error' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** هيكل تحميل مطابق لشكل البطاقات النهائي بدل مؤشر دوّار فقط. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-auto">
      {Array.from({ length: count }, (_, index) => (
        <div className="card card-pad stack" key={index} aria-hidden="true">
          <div className="skeleton" style={{ height: 18, width: '55%' }} />
          <div className="skeleton" style={{ height: 12, width: '85%' }} />
          <div className="skeleton" style={{ height: 12, width: '70%' }} />
        </div>
      ))}
    </div>
  );
}
