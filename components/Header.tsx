import React, { useState, useEffect, useRef } from 'react';
import { Menu, Save, Share2, ArrowLeft, UserCircle, Edit2 } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  sessionName?: string;
  onToggleSidebar?: () => void;
  onBack?: () => void;
  onGoHome?: () => void;
  isWorkspace: boolean;
  user?: UserProfile;
  onLogin?: () => void;
  onLogout?: () => void;
  onRename?: (newName: string) => void;
  onSave?: () => void; // Added onSave prop
  onSwitchAccount?: () => void; // New Prop
  isSaving?: boolean;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  error?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  sessionName,
  onToggleSidebar,
  onBack,
  onGoHome,
  isWorkspace,
  user,
  onLogin,
  onLogout,
  onRename,
  onSave,
  onSwitchAccount,
  isSaving = false,
  saveStatus = 'saved',
  error
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sessionName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(sessionName || '');
  }, [sessionName]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleNameSubmit = () => {
    if (editName.trim() && onRename) {
      onRename(editName.trim());
    } else {
      setEditName(sessionName || '');
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') {
      setEditName(sessionName || '');
      setIsEditing(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-sm border-b border-gray-200 z-50 flex items-center justify-between px-6 shadow-sm">

      {/* Left Actions (Back, Logo) */}
      <div className="flex items-center gap-3 w-1/3">
        {isWorkspace && onBack && (
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Logo */}
        <div className="flex items-center cursor-pointer group shrink-0" onClick={onGoHome} title="Go to Home">
          {/* The B Box */}
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md group-hover:scale-105 transition-transform z-10">B</div>
          {/* The rest of the word */}
          <span className="text-xl font-bold text-gray-900 tracking-tight leading-none ml-1 -mt-0.5 group-hover:text-black transition-colors hidden sm:block">rainstorm</span>
        </div>
      </div>

      {/* Center Title */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
        {/* Session Name (Only in Workspace) */}
        {isWorkspace && sessionName && (
          <div className="flex items-center">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={handleKeyDown}
                className="text-base text-center text-black font-bold bg-white border border-gray-300 rounded px-2 outline-none min-w-[200px]"
              />
            ) : (
              <span
                onClick={() => onRename && setIsEditing(true)}
                className="text-base text-black font-bold hover:bg-gray-100 rounded px-3 py-1 cursor-text flex items-center gap-2 transition-colors group"
                title="Click to rename"
              >
                {sessionName}
                <Edit2 className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Actions (Save, User) */}
      <div className="flex items-center justify-end gap-2 w-1/3">
        {isWorkspace && (
          <>
            <button
              onClick={onSave}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${saveStatus === 'error' ? 'text-red-500 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}
              title={error || ''}
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">
                {saveStatus === 'error' ? 'Save Error' : (isSaving ? 'Saving...' : 'Saved')}
              </span>
            </button>
            {saveStatus === 'error' && error && (
              <div className="absolute top-16 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 shadow-lg max-w-md break-words">
                <p className="font-bold text-sm">Sync Error</p>
                <p className="text-xs mt-1">{error}</p>
                <p className="text-xs font-semibold mt-2">Please tell the assistant this exact error message!</p>
              </div>
            )}

            <div className="w-px h-6 bg-gray-200 mx-2 hidden sm:block"></div>
          </>
        )}

        <div className="relative">
          <button
            onClick={() => user ? setShowUserMenu(!showUserMenu) : onLogin?.()}
            className="flex items-center gap-2 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Profile" className="w-9 h-9 rounded-full border border-gray-200" />
            ) : (
              <UserCircle className="w-9 h-9 text-gray-400" />
            )}
          </button>

          {showUserMenu && user && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)}></div>
              <div className="absolute right-0 top-12 bg-white rounded-xl shadow-xl border border-gray-100 w-56 py-1 z-40 animate-in fade-in zoom-in duration-150">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                  <div className="text-sm font-bold text-gray-800">{user.full_name || 'User'}</div>
                  <div className="text-xs text-gray-500 truncate">{user.email}</div>
                </div>

                <button
                  onClick={() => {
                    // Trigger Switch Account which logs out + opens modal
                    onSwitchAccount?.();
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Switch Account
                </button>

                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};