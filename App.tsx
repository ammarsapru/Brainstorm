import React, { useState, useEffect } from 'react';
import { Workspace } from './components/Workspace';
import { SessionList } from './components/SessionList';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { Session, UserProfile } from './types';
import { INITIAL_CARDS } from './constants';
import { supabase } from './lib/supabase';
import { AuthModal } from './components/AuthModal';
import { mapSessionData } from './src/utils/mappers';


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
  // No local storage for sessions anymore
  const [sessions, setSessions] = useState<Session[]>([]);

  const [view, setView] = useState<AppView>(() => {
    const saved = localStorage.getItem('current_view');
    return (saved as AppView) || 'landing';
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('last_active_session_id');
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);


  // Auth State
  // Auth State
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch Sessions Function
  const fetchSessions = async (userId: string) => {
    console.log('[App] fetchSessions called with userId:', userId);
    if (!userId) {
      console.error('[App] No userId provided to fetchSessions!');
      return;
    }

    setIsLoading(true);
    try {
      console.log('[App] Executing Supabase query...');
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_modified', { ascending: false });

      if (sessionsError) {
        console.error('[App] Supabase error fetching sessions:', sessionsError);
        throw sessionsError;
      }

      console.log('[App] Fetch success. Sessions found:', sessionsData?.length);
      if (sessionsData && sessionsData.length > 0) {
        console.log('[App] Sample Session User ID:', sessionsData[0].user_id);
      }

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        return;
      }

      const sessionIds = sessionsData.map(s => s.id);

      const { data: allCards } = await supabase.from('cards').select('*').in('session_id', sessionIds);
      const { data: allConns } = await supabase.from('connections').select('*').in('session_id', sessionIds);
      const { data: allFiles } = await supabase.from('file_system_nodes').select('*').in('session_id', sessionIds);
      const { data: allCollections } = await supabase.from('collections').select('*').in('session_id', sessionIds);

      const mappedSessions = sessionsData.map(s => {
        const sessionCards = allCards?.filter(c => c.session_id === s.id) || [];
        const sessionConns = allConns?.filter(c => c.session_id === s.id) || [];
        const sessionFiles = allFiles?.filter(f => f.session_id === s.id) || [];
        const sessionCollections = allCollections?.filter(c => c.session_id === s.id) || [];

        return mapSessionData(s, sessionCards, sessionConns, sessionFiles, sessionCollections);
      });

      setSessions(mappedSessions);

      // Securely restore active session if valid
      const lastActiveId = localStorage.getItem('last_active_session_id');
      if (lastActiveId && mappedSessions.some(s => s.id === lastActiveId)) {
        setActiveSessionId(lastActiveId);
        // Only switch view if we are on landing/dashboard (don't override if user is navigating? actually this runs on mount/login)
        setView('workspace');
      } else {
        localStorage.removeItem('last_active_session_id');
      }

    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check for supabase auth session
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const u = {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name,
            avatar_url: session.user.user_metadata?.avatar_url
          };
          setUser(u);
          fetchSessions(u.id);
        } else {
          setSessions([]);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          const u = {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name,
            avatar_url: session.user.user_metadata?.avatar_url
          };
          setUser(u);
          // fetchSessions handles the restoration now
          fetchSessions(u.id);

          // Deep Linking
          const pendingId = localStorage.getItem('pending_session_id');
          if (pendingId) {
            localStorage.removeItem('pending_session_id');
            setActiveSessionId(pendingId);
            setView('workspace');
          } else {
            // INTENT-BASED REDIRECT:
            // Only redirect to dashboard if the user explicitly initiated a login flow.
            // This prevents random redirects when tabs are focused or tokens refresh.
            const hasLoginIntent = localStorage.getItem('login_redirect_intent');
            if (hasLoginIntent && view === 'landing') {
              console.log('[App] Login Intent detected. Redirecting to dashboard.');
              localStorage.removeItem('login_redirect_intent');
              setView('dashboard');
            }
          }

        } else {
          // Automatic Cleanup (Handles token expiry, remote logout, etc.)
          setUser(undefined);
          setSessions([]);
          setActiveSessionId(null);
          // Only redirect to landing if not already there (prevents interference during initial load if needed, though usually safe)
          setView(v => v === 'landing' ? v : 'landing');

          localStorage.removeItem('last_active_session_id');
          localStorage.removeItem('current_view');
          localStorage.removeItem('pending_session_id');
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

    // Clear State
    setUser(undefined);
    setSessions([]);
    setActiveSessionId(null);
    setView('landing');

    // Clear Persistence
    localStorage.removeItem('mindcanvas_sessions');
    localStorage.removeItem('last_active_session_id');
    localStorage.removeItem('current_view');
    localStorage.removeItem('pending_session_id');
  };

  // Persistence Removed
  // useEffect(() => {
  //   localStorage.setItem('mindcanvas_sessions', JSON.stringify(sessions));
  // }, [sessions]);

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
  const handleCreateSession = async () => {
    // Ensure we have a user (or handle potentially via anon if needed, but DB requires user_id)
    if (!user && !supabase) {
      // Fallback for demo mode without supabase
    } else if (!user) {
      alert("You must be logged in to create a session.");
      return;
    }

    // ADDED: Ensure profile exists before creating session
    if (supabase && user) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();

        // Only create profile if not found (PGRST116 is "not found" error code)
        if (error?.code === 'PGRST116' || !profile) {
          console.log('Profile not found, creating profile for user:', user.id);
          const { error: upsertError } = await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url
          }, { onConflict: 'id' });

          if (upsertError) {
            console.error('Failed to create profile:', upsertError);
            alert('Failed to initialize user profile. Please try again.');
            return;
          }
          console.log('Profile created successfully');
        } else if (error) {
          // Handle other database errors
          console.error('Database error while checking profile:', error);
          alert('An error occurred while verifying your profile. Please try again.');
          return;
        }
      } catch (err) {
        console.error('Error checking/creating profile:', err);
        alert('An error occurred. Please try again.');
        return;
      }
    }

    // Generate unique IDs for this session's defaults to avoid RLS/PK collisions
    const defaultCollectionId = crypto.randomUUID();

    // Clone cards and update their collectionId to the new unique one
    const initialCardsWithUniqueCollection = INITIAL_CARDS.map(card => ({
      ...card,
      id: crypto.randomUUID(), // Generate unique Card ID to avoid PK collisions
      collectionId: defaultCollectionId
    }));

    // Generate unique IDs for File System
    const folderId = crypto.randomUUID();
    const fileId = crypto.randomUUID();

    const initialFileSystem = [
      {
        id: folderId,
        type: 'folder' as const,
        name: 'Brainstorming',
        isOpen: true,
        createdAt: Date.now(),
        children: [
          { id: fileId, type: 'file' as const, name: 'Notes', content: '', createdAt: Date.now() }
        ]
      }
    ];

    const newSession: Session = {
      id: crypto.randomUUID(),
      user_id: user?.id,
      name: `Untitled Session ${sessions.length + 1}`,
      cards: initialCardsWithUniqueCollection,
      collections: [{ id: defaultCollectionId, name: 'General Ideas' }],
      connections: [],
      fileSystem: initialFileSystem,
      chatHistory: [],
      strokes: [],
      lastModified: Date.now()
    };
    // Sync to DB immediately (Await this BEFORE updating state to prevent Race Condition with RLS)
    if (supabase && user) {
      const { error } = await supabase.from('sessions').insert({
        id: newSession.id,
        user_id: user.id,
        name: newSession.name,
        strokes: [],
        last_modified: new Date(newSession.lastModified).toISOString()
      });
      if (error) {
        console.error('Error creating session in Supabase:', error);
        alert('Failed to create session on server.');
        return;
      }
    }

    // THEN update state (Safe to render Workspace now)
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setView('workspace');
  };

  // Delete session
  const handleDeleteSession = async (id: string) => {
    // Optimistic delete from UI
    setSessions(prev => prev.filter(s => s.id !== id));

    if (activeSessionId === id) {
      setActiveSessionId(null);
      setView('dashboard');
    }

    // Delete from Supabase
    if (supabase && user) {
      const { error } = await supabase.from('sessions').delete().eq('id', id);
      if (error) {
        console.error('Error deleting session:', error);
        // Optionally revert UI state, but usually fine to just log
        alert('Failed to delete session from server.');
      }
    }
  };

  // Rename session (from dashboard)
  const handleRenameSession = async (id: string, newName: string) => {
    // Optimistic update
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName, lastModified: Date.now() } : s));

    if (supabase && user) {
      const { error } = await supabase
        .from('sessions')
        .update({
          name: newName,
          last_modified: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        console.error('Error renaming session:', error);
        // Optionally revert UI or show error
      }
    }
  };

  // Update session data from Workspace
  const handleSaveSession = (updatedSession: Session) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  const handleUpdateSessionImage = async (sessionId: string, image: string) => {
    // Optimistic Update
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, thumbnail: image } : s));

    if (supabase && user) {
      const { error } = await supabase
        .from('sessions')
        .update({ thumbnail: image })
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating session thumbnail:', error);
      }
    }
  };

  const handleUpdateSessionIcon = async (sessionId: string, icon: string) => {
    // Optimistic Update
    setSessions(prev => prev.map(s => s.id === sessionId ? ({ ...s, icon: icon }) : s));

    if (supabase && user) {
      const { error } = await supabase
        .from('sessions')
        .update({ icon: icon })
        .eq('id', sessionId);

      if (error) {
        console.error('Error updating session icon:', error);
      }
    }
  };

  const handleGoHome = () => {
    setActiveSessionId(null);
    if (user) {
      setView('dashboard');
    } else {
      setView('landing');
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Switch Account: Logs out and immediately opens Auth Modal to allow sign in with different account
  const handleSwitchAccount = async () => {
    if (supabase) await supabase.auth.signOut();

    // Clear State (similar to logout)
    setUser(undefined);
    setSessions([]);
    setActiveSessionId(null);
    setView('landing');

    // Clear Persistence
    localStorage.removeItem('mindcanvas_sessions');
    localStorage.removeItem('last_active_session_id');
    localStorage.removeItem('current_view');
    localStorage.removeItem('pending_session_id');

    // Open Auth Modal immediately
    setIsAuthModalOpen(true);
  };

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
        onSwitchAccount={handleSwitchAccount}
      />
    );
  }

  // 3. Dashboard View - Global Header
  return (
    <>
      <Header isWorkspace={false} onGoHome={handleGoHome} user={user} onLogin={handleLogin} onLogout={handleLogout} onSwitchAccount={handleSwitchAccount} />
      <SessionList
        sessions={sessions}
        isLoading={isLoading}
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