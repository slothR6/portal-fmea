import React from "react";
import { ToastItem } from "../../hooks/useToasts";

export default function Toasts({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}) {
  if (!toasts.length) return null;

  const styleByType: Record<string, string> = {
    success: "bg-green-50 border-green-100 text-green-700",
    error: "bg-red-50 border-red-100 text-red-700",
    info: "bg-blue-50 border-blue-100 text-blue-700",
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 w-[360px] max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`border rounded-2xl shadow-lg p-4 ${styleByType[t.type]}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="font-black">{t.title}</p>
              {t.message ? <p className="text-sm mt-1">{t.message}</p> : null}
            </div>
            <button
              className="text-xl leading-none opacity-60 hover:opacity-100"
              onClick={() => onClose(t.id)}
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
