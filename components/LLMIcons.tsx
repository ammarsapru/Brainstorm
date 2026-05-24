import React, { useId } from 'react';

/** Google Gemini — four-point star */
export const GeminiIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => {
  const gid = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`gemini-${gid}`} x1="4" y1="4" x2="20" y2="20">
          <stop stopColor="#4285F4" />
          <stop offset="0.45" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.2 6.8L21 12l-6.8 2.7L12 21.5 9.8 14.7 3 12l6.8-2.7L12 2.5z"
        fill={`url(#gemini-${gid})`}
      />
    </svg>
  );
};

/** OpenAI — brand swirl mark */
export const OpenAIIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="#10a37f" aria-hidden>
    <path d="M22.28 9.82a5.8 5.8 0 0 0-.52-4.74 5.86 5.86 0 0 0-6.31-2.82 5.86 5.86 0 0 0-9.1-2.2 5.84 5.84 0 0 0-5.62 2.02 5.86 5.86 0 0 0-2.83 6.31 5.8 5.8 0 0 0 .7 6.87 5.86 5.86 0 0 0 6.31 2.82 5.86 5.86 0 0 0 5.27 3.08 5.84 5.84 0 0 0 5.62-2.02 5.86 5.86 0 0 0 2.83-6.31 5.8 5.8 0 0 0-.82-3.05zM12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17zm-1.1-4.2l4.2-2.4-4.2-2.4v4.8z" />
  </svg>
);

/** Anthropic Claude — terracotta mark */
export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect width="24" height="24" rx="5" fill="#D97757" />
    <path
      d="M12 7.5c-2.8 3.2-4.5 5.8-4.5 8.2a4.5 4.5 0 0 0 9 0c0-2.4-1.7-5-4.5-8.2z"
      fill="#FAF9F5"
    />
    <path
      d="M12 6.5l1.2 2.4 2.6.4-1.9 1.8.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.8 2.6-.4L12 6.5z"
      fill="#FAF9F5"
      opacity="0.35"
    />
  </svg>
);

export const ProviderIcon: React.FC<{
  provider: 'google' | 'openai' | 'anthropic';
  className?: string;
}> = ({ provider, className }) => {
  switch (provider) {
    case 'openai':
      return <OpenAIIcon className={className} />;
    case 'anthropic':
      return <ClaudeIcon className={className} />;
    default:
      return <GeminiIcon className={className} />;
  }
};
