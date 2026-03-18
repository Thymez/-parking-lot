import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const DialogContext = createContext({
  alert: async () => undefined,
  confirm: async () => false
});

const toneConfig = {
  info: {
    ring: 'ring-sky-200',
    accent: 'from-sky-500/90 to-blue-500/90',
    iconBg: 'bg-sky-100 text-sky-600',
    confirmBtn: 'from-sky-600 to-blue-600 shadow-sky-600/30'
  },
  success: {
    ring: 'ring-emerald-200',
    accent: 'from-emerald-500/90 to-lime-500/90',
    iconBg: 'bg-emerald-100 text-emerald-600',
    confirmBtn: 'from-emerald-500 to-lime-500 shadow-emerald-600/30'
  },
  warning: {
    ring: 'ring-amber-200',
    accent: 'from-amber-500/90 to-orange-500/90',
    iconBg: 'bg-amber-100 text-amber-600',
    confirmBtn: 'from-amber-500 to-orange-500 shadow-amber-600/30'
  },
  danger: {
    ring: 'ring-rose-200',
    accent: 'from-rose-500/90 to-red-500/90',
    iconBg: 'bg-rose-100 text-rose-600',
    confirmBtn: 'from-rose-500 to-red-500 shadow-rose-600/30'
  }
};

const defaultOptions = {
  title: 'แจ้งเตือน',
  message: '',
  variant: 'info',
  confirmText: 'ตกลง',
  cancelText: 'ยกเลิก'
};

function normalizeOptions(input, type) {
  if (typeof input === 'string') {
    return {
      ...defaultOptions,
      message: input,
      title: type === 'confirm' ? 'ยืนยันการทำรายการ' : defaultOptions.title,
      confirmText: type === 'confirm' ? 'ยืนยัน' : defaultOptions.confirmText,
      type
    };
  }

  const base = {
    ...defaultOptions,
    ...(input || {}),
    type
  };

  if (!base.title) {
    base.title = type === 'confirm' ? 'ยืนยันการทำรายการ' : defaultOptions.title;
  }
  if (!base.confirmText) {
    base.confirmText = type === 'confirm' ? 'ยืนยัน' : defaultOptions.confirmText;
  }
  return base;
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [dialog]);

  const closeDialog = useCallback((result) => {
    setDialog((current) => {
      current?.resolve?.(result);
      return null;
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (dialog?.type === 'confirm') {
      closeDialog(false);
    } else {
      closeDialog(true);
    }
  }, [closeDialog, dialog?.type]);

  const openDialog = useCallback((input, type) => {
    const config = normalizeOptions(input, type);
    return new Promise((resolve) => {
      setDialog({
        ...config,
        resolve
      });
    });
  }, []);

  const alert = useCallback((options) => openDialog(options, 'alert'), [openDialog]);
  const confirm = useCallback((options) => openDialog(options, 'confirm'), [openDialog]);

  const contextValue = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  const tone = dialog ? toneConfig[dialog.variant] || toneConfig.info : toneConfig.info;

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {mounted && dialog && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div
            className={`relative w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ${tone.ring} animate-[fadeIn_0.2s_ease-out]`}
          >
            <div className={`h-1.5 w-full rounded-t-3xl bg-gradient-to-r ${tone.accent}`} />
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-semibold ${tone.iconBg}`}>
                  {dialog.icon || '⚡'}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">{dialog.title}</p>
                  {dialog.subtitle && (
                    <p className="text-sm text-slate-500">{dialog.subtitle}</p>
                  )}
                </div>
              </div>
              <p className="text-base leading-relaxed text-slate-600 whitespace-pre-line">
                {dialog.message}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-4">
                {dialog.type === 'confirm' && (
                  <button
                    onClick={handleCancel}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-600 font-medium transition hover:border-slate-300 hover:bg-slate-50 sm:max-w-[160px]"
                  >
                    {dialog.cancelText}
                  </button>
                )}
                <button
                  onClick={() => closeDialog(true)}
                  className={`w-full rounded-2xl bg-gradient-to-r ${tone.confirmBtn || 'from-slate-900 to-slate-800 shadow-slate-900/10'} px-4 py-2.5 text-white font-semibold shadow-lg transition hover:translate-y-[-1px] sm:max-w-[180px]`}
                >
                  {dialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return context;
}
