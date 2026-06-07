import React, { useState, useRef } from 'react';

interface TooltipProps {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  position = 'top',
  delay = 500,
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timer.current = setTimeout(() => setVisible(true), delay);
  };

  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  const pos: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {visible && (
        <div className={`absolute ${pos[position]} z-[99999] pointer-events-none`}>
          <div className="bg-zinc-800 text-white text-[11px] leading-tight px-2 py-1 rounded-md shadow-lg whitespace-nowrap font-medium">
            {text}
          </div>
        </div>
      )}
    </div>
  );
};
