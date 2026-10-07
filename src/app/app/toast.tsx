"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastKind = "error" | "success";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
};

const MAX_VISIBLE = 3;
const DURATION_MS = 6000;

const ToastContext = createContext<ToastApi>({
  notifyError: () => {},
  notifySuccess: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => {
        // A mesma falha não gera mensagens duplicadas.
        if (current.some((toast) => toast.message === message)) return current;
        const next = [...current, { id, kind, message }];
        return next.slice(-MAX_VISIBLE);
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS)
      );
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      notifyError: (message) => push("error", message),
      notifySuccess: (message) => push("success", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.kind === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-[#cfe3d6] bg-[#edf7ef] text-[#477152]"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => dismiss(toast.id)}
              className="text-base leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
