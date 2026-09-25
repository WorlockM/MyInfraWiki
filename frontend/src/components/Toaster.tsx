import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Toast, subscribeToasts, dismissToast } from '../toast';

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast__message">{t.message}</span>
          {t.action && (
            <button
              className="toast__action"
              onClick={() => {
                dismissToast(t.id);
                t.action!.onClick();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast__close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
