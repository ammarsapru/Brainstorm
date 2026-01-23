import React, { useState, useEffect } from 'react';
import { Workspace } from './components/Workspace';
import { SessionList } from './components/SessionList';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { Session, UserProfile } from './types';
import { INITIAL_CARDS } from './constants';
import { supabase } from './lib/supabase';
import { AuthModal } from './components/AuthModal';


// Initial File System Data for new sessions
const DEFAULT_FILE_SYSTEM = [
  {
    id: '22222222-2222-2222-2222-222222222222', // Valid UUID
    type: 'folder' as const,
    name: 'Brainstorming',
    isOpen: true,
    createdAt: Date.now(),
    children: [
      { id: '33333333-3333-3333-3333-333333333333', type: 'file' as const, name: 'Notes', content: '', createdAt: Date.now() } // Valid UUID
    ]
  }
];

type AppView = 'landing' | 'dashboard' | 'workspace';

function App() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('mindcanvas_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<AppView>(() => {
    const saved = localStorage.getItem('current_view');
    return (saved as AppView) || 'landing';
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('last_active_session_id');
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);


  // Auth State
  const [user, setUser] = useState<UserProfile | undefined>(undefined);

  useEffect(() => {
    // Check for supabase auth session
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name,
            avatar_url: session.user.user_metadata?.avatar_url
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name,
            avatar_url: session.user.user_metadata?.avatar_url
          });

          // Deep Linking Restoration
          const pendingId = localStorage.getItem('pending_session_id');
          if (pendingId) {
            localStorage.removeItem('pending_session_id');
            setActiveSessionId(pendingId);
            setView('workspace');
          } else {
            // Restore last active session if exists
            const lastActiveId = localStorage.getItem('last_active_session_id');
            if (lastActiveId) {
              // Verify the session actually exists in our list (we might not have loaded sessions yet, but we load from localstorage sync)
              // Since sessions state is initialized from localstorage synchronously, we can trust it exists if we find it.
              // However, inside this callback, we need to be careful about closure staleness? 
              // Using functional update or check effectively.
              // Actually, the sessions state might be stale in this closure if not in dependency array.
              // But `supabase.auth.onAuthStateChange` is set up once on mount. 
              // We can't access `sessions` state reliably here without ref or dependency.
              // BUT, we can just set the ID and View. If ID is invalid, Workspace might handle it or we deal with it later.
              // Better approach: check localStorage for sessions directly to be safe?
              const savedSessions = JSON.parse(localStorage.getItem('mindcanvas_sessions') || '[]');
              if (savedSessions.some((s: any) => s.id === lastActiveId)) {
                setActiveSessionId(lastActiveId);
                setView('workspace');
              }
            }
          }

        } else {

          setUser(undefined);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const handleLogin = async () => {
    // For demo purposes if supabase isn't connected, we mock login
    if (!supabase) {
      alert('Supabase is not configured. Please check your .env.local file for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setUser({
        id: 'mock-user-1',
        email: 'demo@brainstorm.app',
        full_name: 'Demo User',
        avatar_url: 'https://ui-avatars.com/api/?name=Demo+User&background=0D8ABC&color=fff'
      });
      if (view === 'landing') setView('dashboard');
      return;
    }

    // Open Auth Modal
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(undefined);
    setView('landing');
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('mindcanvas_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Persist Active Session
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('last_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('last_active_session_id');
    }
  }, [activeSessionId]);

  // Persist View State
  useEffect(() => {
    localStorage.setItem('current_view', view);
  }, [view]);

  // Create new session
  const handleCreateSession = () => {
    // Ensure we have a user (or handle potentially via anon if needed, but DB requires user_id)
    if (!user && !supabase) {
      // Fallback for demo mode without supabase
    } else if (!user) {
      alert("You must be logged in to create a session.");
      return;
    }

    const newSession: Session = {
      id: crypto.randomUUID(), // Fix: Use proper UUID
      user_id: user?.id,       // Fix: Assign User ID
      name: `Untitled Session ${sessions.length + 1}`,
      cards: INITIAL_CARDS,
      connections: [],
      fileSystem: DEFAULT_FILE_SYSTEM,
      chatHistory: [], // Initialize empty chat
      lastModified: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setView('workspace');
  };

  // Delete session
  const handleDeleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setView('dashboard');
    }
  };

  // Rename session (from dashboard)
  const handleRenameSession = (id: string, newName: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName, lastModified: Date.now() } : s));
  };

  // Update session data from Workspace
  const handleSaveSession = (updatedSession: Session) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  const handleUpdateSessionImage = (sessionId: string, image: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, thumbnail: image } : s));
  };

  const handleUpdateSessionIcon = (sessionId: string, icon: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, icon: icon } : s));
  };

  const handleGoHome = () => {
    setView('landing');
    setActiveSessionId(null);
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // VIEW ROUTING

  // 1. Landing View - No global Header
  if (view === 'landing') {
    return (
      <>
        <LandingPage onGetStarted={() => {
          if (user) {
            setView('dashboard');
          } else {
            handleLogin();
          }
        }} />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
      </>
    );
  }

  // 2. Workspace View - Internal Header
  if (view === 'workspace' && activeSession) {
    return (
      <Workspace
        session={activeSession}
        onSave={handleSaveSession}
        onBack={() => { setActiveSessionId(null); setView('dashboard'); }}
        onGoHome={handleGoHome}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
    );
  }

  // 3. Dashboard View - Global Header
  return (
    <>
      <Header isWorkspace={false} onGoHome={handleGoHome} user={user} onLogin={handleLogin} onLogout={handleLogout} />
      <SessionList
        sessions={sessions}
        onSelect={(s) => { setActiveSessionId(s.id); setView('workspace'); }}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
        onRename={handleRenameSession}
        onUpdateSessionImage={handleUpdateSessionImage}
        onUpdateSessionIcon={handleUpdateSessionIcon}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );

}

export default App;