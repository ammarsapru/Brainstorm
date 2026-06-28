import React, { useEffect, useRef } from 'react';
import { Type, Tag, Image as ImageIcon, FileText, Globe } from 'lucide-react';

interface CardCreationMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSelectText: () => void;
  onSelectLabel: () => void;
  onSelectBrowser: () => void;
  onImageFile: (file: File) => void;
  onDocFile: (file: File) => void;
}

export const CardCreationMenu: React.FC<CardCreationMenuProps> = ({
  x, y, onClose, onSelectText, onSelectLabel, onSelectBrowser, onImageFile, onDocFile,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, { capture: true });
    };
  }, [onClose]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onImageFile(file); onClose(); }
    e.target.value = '';
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onDocFile(file); onClose(); }
    e.target.value = '';
  };

  const options = [
    {
      icon: <Type className="w-4 h-4" />,
      label: 'Text card',
      sublabel: 'Editable note with document editor',
      action: () => { onSelectText(); onClose(); },
    },
    {
      icon: <Tag className="w-4 h-4" />,
      label: 'Label',
      sublabel: 'Short title, no editor',
      action: () => { onSelectLabel(); onClose(); },
    },
    {
      icon: <ImageIcon className="w-4 h-4" />,
      label: 'Image',
      sublabel: 'Upload PNG, JPG, GIF, WebP, SVG',
      action: () => imageInputRef.current?.click(),
    },
    {
      icon: <FileText className="w-4 h-4" />,
      label: 'File',
      sublabel: 'Upload PDF, DOCX, PPTX, MD, TXT',
      action: () => docInputRef.current?.click(),
    },
    {
      icon: <Globe className="w-4 h-4" />,
      label: 'Browser',
      sublabel: 'Embed a website in the canvas',
      action: () => { onSelectBrowser(); onClose(); },
    },
  ];

  // Keep menu on screen
  const menuW = 240;
  const menuH = 244;
  const left = Math.min(x, window.innerWidth - menuW - 12);
  const top = Math.min(y, window.innerHeight - menuH - 12);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 animate-in fade-in zoom-in-95 duration-150"
      style={{ left, top, width: menuW }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <button
          key={opt.label}
          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
          onClick={opt.action}
        >
          <span className="mt-0.5 shrink-0 text-gray-500">{opt.icon}</span>
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-800">{opt.label}</span>
            <span className="text-xs text-gray-400 truncate">{opt.sublabel}</span>
          </span>
        </button>
      ))}

      <input
        ref={imageInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
        className="hidden"
        onChange={handleImageChange}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.md,.docx,.pptx,.txt,.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.pyw,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.cs,.go,.rs,.rb,.php,.swift,.kt,.kts,.dart,.html,.htm,.css,.scss,.sass,.less,.json,.yaml,.yml,.toml,.xml,.sh,.bash,.zsh,.sql,.graphql,.gql,.r,.lua,.ex,.exs,.hs,.clj,.cljs,.vim,.tf,.proto"
        className="hidden"
        onChange={handleDocChange}
      />
    </div>
  );
};
