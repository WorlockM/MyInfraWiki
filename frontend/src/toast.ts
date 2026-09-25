import axios from 'axios';

// Minimal global toast store: any component (or non-React code) can show a
// message; the <Toaster> in App renders them.

export type ToastKind = 'error' | 'success';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(kind: ToastKind, message: string, action?: ToastAction) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message, action }];
  emit();
  // Toasts with an action (e.g. Undo) stay a little longer
  setTimeout(() => dismissToast(id), action ? 8000 : 5000);
}

// Show a failed API call to the user, using the server's error message when
// it sent one, and log the details for debugging.
export function showError(fallback: string, err?: unknown) {
  if (err !== undefined) console.error(fallback, err);
  showToast('error', apiErrorMessage(err, fallback));
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return `${fallback}: the server is unreachable`;
    const message = (err.response.data as { error?: unknown } | undefined)?.error;
    if (typeof message === 'string' && message !== fallback) return `${fallback}: ${message}`;
  }
  return fallback;
}
