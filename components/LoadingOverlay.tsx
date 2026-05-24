import React, { useEffect } from 'react';

export type LoadingVariant = 'auth' | 'dashboard' | 'workspace';

const COPY: Record<
  LoadingVariant,
  { title: string; statuses: string[] }
> = {
  auth: {
    title: 'Signing you in',
    statuses: [
      'Connecting to secure server…',
      'Verifying credentials…',
      'Restoring your session…',
    ],
  },
  dashboard: {
    title: 'Loading your sessions',
    statuses: [
      'Fetching session list…',
      'Loading canvas previews…',
      'Almost ready…',
    ],
  },
  workspace: {
    title: 'Opening your canvas',
    statuses: [
      'Loading cards and connections…',
      'Loading documents and files…',
      'Preparing workspace…',
    ],
  },
};

interface LoadingOverlayProps {
  variant?: LoadingVariant;
  title?: string;
  message?: string;
}

/** Full-screen loader — fixed, non-scrollable. */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  variant = 'auth',
  title,
  message,
}) => {
  const copy = COPY[variant];
  const titleText = title || copy.title;
  const [status, setStatus] = React.useState(message || copy.statuses[0]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!message) {
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % copy.statuses.length;
        setStatus(copy.statuses[i]);
      }, 1200);
    } else {
      setStatus(message);
    }

    return () => {
      if (interval) clearInterval(interval);
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHeight;
    };
  }, [copy.statuses, message]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center overflow-hidden overscroll-none touch-none"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex items-center justify-center mb-8">
        <div className="absolute w-24 h-24 border-2 border-white/10 border-t-white rounded-full animate-spin" />
        <div className="absolute w-32 h-32 border border-white/5 border-b-white/30 rounded-full animate-[spin_3s_linear_reverse_infinite]" />
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-black font-bold text-4xl shadow-[0_0_40px_rgba(255,255,255,0.15)] z-10">
          B
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-1">
        <span>{titleText}</span>
        <span className="flex gap-0.5">
          <span className="animate-[bounce_1s_infinite_0ms]">.</span>
          <span className="animate-[bounce_1s_infinite_200ms]">.</span>
          <span className="animate-[bounce_1s_infinite_400ms]">.</span>
        </span>
      </h3>
      <p className="text-gray-400 font-medium mt-3 text-sm animate-pulse">{status}</p>
    </div>
  );
};
