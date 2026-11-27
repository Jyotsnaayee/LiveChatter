import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';

interface CaptchaWidgetProps {
  refreshTrigger?: number;
  value: string;
  onChange: (payload: { captchaId: string; captchaAnswer: string }) => void;
  disabled?: boolean;
}

export function CaptchaWidget({ refreshTrigger = 0, value, onChange, disabled = false }: CaptchaWidgetProps) {
  const [captchaId, setCaptchaId] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getCaptcha();
      setCaptchaId(data.captchaId);
      setImageDataUrl(data.imageDataUrl);
      onChange({ captchaId: data.captchaId, captchaAnswer: '' });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load verification challenge.');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    loadChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#14171F] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>Human Verification (CAPTCHA)</span>
        </div>
        <button
          type="button"
          onClick={loadChallenge}
          disabled={loading || disabled}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-50"
          title="Load a new CAPTCHA code"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>New Code</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex h-[70px] w-[220px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-[#0F172A]">
          {loading ? (
            <span className="text-xs text-slate-400">Loading challenge...</span>
          ) : loadError ? (
            <span className="px-2 text-center text-[11px] text-rose-400">{loadError}</span>
          ) : (
            <img
              src={imageDataUrl}
              alt="Human verification CAPTCHA code"
              className="h-[70px] w-[220px] select-none object-contain"
              draggable={false}
            />
          )}
        </div>

        <div className="w-full flex-1 space-y-1">
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Enter the 6 characters shown
          </label>
          <input
            type="text"
            required
            disabled={disabled || loading || !captchaId}
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
              onChange({ captchaId, captchaAnswer: cleaned });
            }}
            placeholder="A1B2C3"
            className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#1D2029] px-3 py-2 font-mono text-base font-bold tracking-[0.25em] uppercase text-slate-900 dark:text-white placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Case-insensitive · Required final step to verify you are human.
          </p>
        </div>
      </div>
    </div>
  );
}
