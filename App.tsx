import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { SessionList } from './components/SessionList';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { ShardsPage } from './components/ShardsPage';
import { LoadingOverlay, LoadingVariant } from './components/LoadingOverlay';
import { Session, UserProfile } from './types';
import { INITIAL_CARDS } from './constants';
import { supabase } from './lib/supabase';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import debugLog from './utils/debugLog';
import { showToast } from './utils/toast';
import {
  fetchSessionSummaries,
  fetchFullSession,
  fetchSessionHeavyData,
  mergeSessionIntoList,
} from './services/sessionLoader';
import { fetchSessionsWithChatFlags } from './services/chatService';

const Workspace = React.lazy(() =>
  import('./components/Workspace').then(m => ({ default: m.Workspace }))
);

type AppView = 'landing' | 'dashboard' | 'workspace' | 'shards';

type LoaderState = {
  phase: LoadingVariant;
  message: string;
} | null;

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);

  const [view, setView] = useState<AppView>(() => {
    const lastActive = localStorage.getItem('last_active_session_id');
    if (lastActive) return 'workspace';
    const saved = localStorage.getItem('current_view');
    return (saved as AppView) || 'landing';
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('last_active_session_id');
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [authReady, setAuthReady] = useState(false);
  const [loadingState, setLoadingState] = useState<LoaderState>({
    phase: 'auth',
    message: 'Checking your session…',
  });
  const [workspaceSession, setWorkspaceSession] = useState<Session | null>(null);
  const [isDashboardLoaded, setIsDashboardLoaded] = useState(false);

  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const initialFetchDoneRef = useRef(false);
  const viewRef = useRef(view);
  const activeSessionIdRef = useRef(activeSessionId);
  const workspaceSessionRef = useRef(workspaceSession);
  const heavyLoadedForRef = useRef<string | null>(null);

  const setLoader = useCallback((phase: LoadingVariant, message: string) => {
    setLoadingState({ phase, message });
  }, []);

  const clearLoader = useCallback(() => {
    setLoadingState(null);
  }, []);

  useEffect(() => {
    workspaceSessionRef.current = workspaceSession;
  }, [workspaceSession]);

  useEffect(() => {
    viewRef.current = view;
    activeSessionIdRef.current = activeSessionId;
  }, [view, activeSessionId]);

  /** Background: chat badges on dashboard cards */
  const enrichSummariesWithChatFlags = useCallback(async (summaries: Session[]) => {
    if (summaries.length === 0) return summaries;
    const chatFlags = await fetchSessionsWithChatFlags(summaries.map(s => s.id));
    return summaries.map(s =>
      chatFlags.has(s.id)
        ? { ...s, chatHistory: [{ id: 'flag', role: 'user' as const, text: '', timestamp: 0 }] }
        : s
    );
  }, []);

  const loadDashboardSessions = useCallback(
    async (userId: string) => {
      setLoader('dashboard', 'Loading your sessions…');
      const summaries = await fetchSessionSummaries(userId);
      setSessions(summaries);
      setIsDashboardLoaded(true);
      clearLoader();
      void enrichSummariesWithChatFlags(summaries).then(enriched => {
        setSessions(prev => {
          const full = workspaceSessionRef.current;
          if (full?.isFullyLoaded) return mergeSessionIntoList(enriched, full);
          return enriched;
        });
      });
    },
    [enrichSummariesWithChatFlags, setLoader, clearLoader]
  );

  /**
   * Refresh / login bootstrap.
   * - restoreWorkspace: open last canvas fast (skip dashboard list + chat flags first)
   * - otherwise: load session list for dashboard
   */
  const fetchSessions = useCallback(
    async (userId: string, options?: { restoreWorkspace?: boolean }) => {
      if (!userId) return;

      if (fetchInFlightRef.current) {
        await fetchInFlightRef.current;
        return;
      }

      const run = async () => {
        try {
          if (options?.restoreWorkspace) {
            const lastActiveId = localStorage.getItem('last_active_session_id');
            if (lastActiveId) {
              setLoader('workspace', 'Restoring your last canvas…');
              debugLog('App', 'Restore workspace on refresh', { sessionId: lastActiveId });

              const full = await withTimeout(
                fetchFullSession(lastActiveId, {
                  deferChat: true,
                  deferStrokes: true,
                }),
                20000,
                'restoreWorkspace'
              );

              if (full) {
                heavyLoadedForRef.current = null;
                setWorkspaceSession(full);
                setActiveSessionId(lastActiveId);
                setView('workspace');
                setSessions([full]);
                clearLoader();
                return;
              }

              localStorage.removeItem('last_active_session_id');
              localStorage.setItem('current_view', 'dashboard');
              setView('dashboard');
              setActiveSessionId(null);
              setWorkspaceSession(null);
            } else if (viewRef.current === 'workspace') {
              setView('dashboard');
            }
          }

          await loadDashboardSessions(userId);
        } catch (err) {
          debugLog.error('App', 'Error fetching sessions', err);
          clearLoader();
          if (options?.restoreWorkspace && viewRef.current === 'workspace') {
            localStorage.removeItem('last_active_session_id');
            showToast('Could not restore your last session. Please check your connection.', 'error');
            setView('dashboard');
            setActiveSessionId(null);
            setWorkspaceSession(null);
          }
        }
      };

      fetchInFlightRef.current = run();
      try {
        await fetchInFlightRef.current;
      } finally {
        fetchInFlightRef.current = null;
      }
    },
    [loadDashboardSessions, enrichSummariesWithChatFlags, setLoader, clearLoader]
  );

  const handleSelectSession = useCallback(async (session: Session) => {
    setWorkspaceSession(null);
    setActiveSessionId(session.id);
    setView('workspace');
    setLoader('workspace', 'Opening your canvas…');
    heavyLoadedForRef.current = null;

    try {
      const full = await withTimeout(
        fetchFullSession(session.id, { deferChat: true, deferStrokes: true }),
        20000,
        'openWorkspace'
      );
      if (full) {
        setWorkspaceSession(full);
        setSessions(prev => mergeSessionIntoList(prev, full));
        clearLoader();
      } else {
        showToast('Could not load this session. Please try again.', 'error');
        setView('dashboard');
        setActiveSessionId(null);
        clearLoader();
      }
    } catch (err) {
      debugLog.error('App', 'Failed to load session', err);
      showToast('Could not load this session. Please check your connection.', 'error');
      setView('dashboard');
      setActiveSessionId(null);
      clearLoader();
    }
  }, [setLoader, clearLoader]);

  // Strokes + chat after canvas is visible (keeps open/refresh fast)
  useEffect(() => {
    const id = workspaceSession?.id;
    if (!id || !workspaceSession.isFullyLoaded) return;
    if (heavyLoadedForRef.current === id) return;
    heavyLoadedForRef.current = id;

    fetchSessionHeavyData(id)
      .then(({ strokes, chatHistory }) => {
        const merge = (prev: Session | null): Session | null => {
          if (!prev || prev.id !== id) return prev;
          return {
            ...prev,
            strokes: strokes.length > 0 ? strokes : prev.strokes,
            chatHistory: chatHistory.length > 0 ? chatHistory : prev.chatHistory,
          };
        };
        setWorkspaceSession(merge);
      })
      .catch(err => {
        debugLog.error('App', 'Failed to load drawings/chat history', err);
        showToast('Could not load drawings or chat history. Check your connection.', 'error');
      });
  }, [workspaceSession?.id, workspaceSession?.isFullyLoaded]);

  // Load dashboard sessions lazily when the view changes to dashboard
  useEffect(() => {
    if (view === 'dashboard' && user && !isDashboardLoaded) {
      void loadDashboardSessions(user.id);
    }
  }, [view, user, isDashboardLoaded, loadDashboardSessions]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      clearLoader();
      return;
    }

    type AuthSession = {
      user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
    };

    const applyUser = (session: AuthSession) => {
      const meta = session.user.user_metadata || {};
      return {
        id: session.user.id,
        email: session.user.email,
        full_name: meta.full_name as string | undefined,
        avatar_url: meta.avatar_url as string | undefined,
      };
    };

    setLoader('auth', 'Checking your authentication…');

    const searchParams = new URLSearchParams(window.location.search);
    const isPKCECallback = searchParams.has('code');
    const isOAuthCallback = isPKCECallback || window.location.hash.includes('access_token=');

    const cleanUrl = () => {
      if (window.location.search || window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    if (isPKCECallback) {
      // Explicit PKCE exchange — more reliable than relying on getSession() auto-detect
      setLoader('auth', 'Completing sign-in…');
      supabase.auth.exchangeCodeForSession(window.location.search)
        .then(({ data: { session }, error }: { data: { session: AuthSession | null }; error: unknown }) => {
          if (error) throw error;
          if (session?.user) {
            const u = applyUser(session);
            setUser(u);
            setIsAuthModalOpen(false);
            cleanUrl();
            if (!initialFetchDoneRef.current) {
              initialFetchDoneRef.current = true;
              void fetchSessions(u.id, { restoreWorkspace: false });
            }
          } else {
            cleanUrl();
            setView('landing');
          }
        })
        .catch((err: unknown) => {
          debugLog.error('App', 'PKCE code exchange failed', err);
          showToast('Sign-in failed. Please try again.', 'error');
          cleanUrl();
          setView('landing');
          setIsDashboardLoaded(false);
        })
        .finally(() => {
          setAuthReady(true);
          clearLoader();
        });
    } else {
      withTimeout(supabase.auth.getSession(), 8000, 'authSession')
        .then(({ data: { session } }: { data: { session: AuthSession | null } }) => {
          if (session?.user) {
            const u = applyUser(session);
            setUser(u);
            setIsAuthModalOpen(false);
            if (!initialFetchDoneRef.current) {
              initialFetchDoneRef.current = true;
              void fetchSessions(u.id, { restoreWorkspace: true });
            }
          } else if (!isOAuthCallback) {
            setSessions([]);
            setWorkspaceSession(null);
            setActiveSessionId(null);
            setView('landing');
            setIsDashboardLoaded(false);
            localStorage.removeItem('last_active_session_id');
            localStorage.removeItem('current_view');
          }
        })
        .catch((err: unknown) => {
          debugLog.error('App', 'Auth session check failed', err);
          setSessions([]);
          setWorkspaceSession(null);
          setActiveSessionId(null);
          setView('landing');
          setIsDashboardLoaded(false);
        })
        .finally(() => {
          setAuthReady(true);
          if (!isOAuthCallback || initialFetchDoneRef.current) {
            clearLoader();
          } else {
            // Fallback: implicit flow token in hash — wait up to 10s for SIGNED_IN
            setTimeout(() => {
              if (!initialFetchDoneRef.current) {
                clearLoader();
                setView('landing');
              }
            }, 10000);
          }
        });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: AuthSession | null) => {
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        const u = applyUser(session);
        setUser(u);
        setIsAuthModalOpen(false);

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && !initialFetchDoneRef.current) {
          initialFetchDoneRef.current = true;
          clearLoader();
          if (window.location.search || window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname);
          }
          void fetchSessions(u.id, { restoreWorkspace: event === 'INITIAL_SESSION' });
        }

        const pendingId = localStorage.getItem('pending_session_id');
        if (pendingId) {
          localStorage.removeItem('pending_session_id');
          void (async () => {
            setLoader('workspace', 'Opening your canvas…');
            try {
              const full = await withTimeout(
                fetchFullSession(pendingId, {
                  deferChat: true,
                  deferStrokes: true,
                }),
                20000,
                'pendingWorkspace'
              );
              if (full) {
                heavyLoadedForRef.current = null;
                setWorkspaceSession(full);
                setSessions(prev => mergeSessionIntoList(prev, full));
                setActiveSessionId(pendingId);
                setView('workspace');
              }
            } finally {
              clearLoader();
            }
          })();
        } else {
          const hasLoginIntent = localStorage.getItem('login_redirect_intent');
          // Use viewRef.current (not closure value) — the subscription is stable across view changes
          if (hasLoginIntent && viewRef.current !== 'workspace') {
            localStorage.removeItem('login_redirect_intent');
            setView('dashboard');
          }
        }
      } else if (event === 'SIGNED_OUT') {
        initialFetchDoneRef.current = false;
        heavyLoadedForRef.current = null;
        setUser(undefined);
        setSessions([]);
        setWorkspaceSession(null);
        setActiveSessionId(null);
        setView('landing');
        clearLoader();
        setIsDashboardLoaded(false);
        localStorage.removeItem('last_active_session_id');
        localStorage.removeItem('current_view');
        localStorage.removeItem('pending_session_id');
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSessions]);

  const handleLogin = async () => {
    if (!supabase) {
      showToast('Supabase is not configured. Running in demo mode — sessions will not be saved.', 'error', 8000);
      setUser({
        id: 'mock-user-1',
        email: 'demo@brainstorm.app',
        full_name: 'Demo User',
        avatar_url:
          'https://ui-avatars.com/api/?name=Demo+User&background=0D8ABC&color=fff',
      });
      if (view === 'landing') setView('dashboard');
      return;
    }
    setIsAuthModalOpen(true);
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(undefined);
    setSessions([]);
    setActiveSessionId(null);
    setWorkspaceSession(null);
    setView('landing');
    clearLoader();
    setIsDashboardLoaded(false);
    initialFetchDoneRef.current = false;
    heavyLoadedForRef.current = null;
    localStorage.removeItem('mindcanvas_sessions');
    localStorage.removeItem('last_active_session_id');
    localStorage.removeItem('current_view');
    localStorage.removeItem('pending_session_id');
  };

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('last_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('last_active_session_id');
    }
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem('current_view', view);
  }, [view]);

  const handleCreateSession = async () => {
    if (!user && !supabase) {
      // demo mode
    } else if (!user) {
      showToast('You must be logged in to create a session.', 'error');
      return;
    }

    if (supabase && user) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();

        if (error?.code === 'PGRST116' || !profile) {
          debugLog('App', 'Creating user profile');
          const { error: upsertError } = await supabase.from('profiles').upsert(
            {
              id: user.id,
              email: user.email,
              full_name: user.full_name,
              avatar_url: user.avatar_url,
            },
            { onConflict: 'id' }
          );

          if (upsertError) {
            debugLog.error('App', 'Failed to create profile', upsertError);
            showToast('Failed to initialize user profile. Please try again.', 'error');
            return;
          }
        } else if (error) {
          debugLog.error('App', 'Database error while checking profile', error);
          showToast('An error occurred while verifying your profile. Please try again.', 'error');
          return;
        }
      } catch (err) {
        debugLog.error('App', 'Error checking/creating profile', err);
        showToast('An error occurred. Please try again.', 'error');
        return;
      }
    }

    const defaultCollectionId = crypto.randomUUID();
    const initialCardsWithUniqueCollection = INITIAL_CARDS.map(card => ({
      ...card,
      id: crypto.randomUUID(),
      collectionId: defaultCollectionId,
    }));

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
          {
            id: fileId,
            type: 'file' as const,
            name: 'Notes',
            content: '',
            createdAt: Date.now(),
          },
        ],
      },
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
      lastModified: Date.now(),
    };

    if (supabase && user) {
      const { error } = await supabase.from('sessions').insert({
        id: newSession.id,
        user_id: user.id,
        name: newSession.name,
        strokes: [],
        last_modified: new Date(newSession.lastModified).toISOString(),
      });
      if (error) {
        debugLog.error('App', 'Error creating session', error);
        showToast('Failed to create session. Check your connection.', 'error');
        return;
      }
    }

    const readySession: Session = { ...newSession, isFullyLoaded: true };
    heavyLoadedForRef.current = readySession.id;
    setSessions(prev => [readySession, ...prev]);
    setWorkspaceSession(readySession);
    setActiveSessionId(newSession.id);
    setView('workspace');
    clearLoader();
  };

  const handleDeleteSession = async (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setWorkspaceSession(null);
      setView('dashboard');
    }
    if (supabase && user) {
      const { error } = await supabase.from('sessions').delete().eq('id', id);
      if (error) {
        debugLog.error('App', 'Error deleting session', error);
        showToast('Failed to delete session from server.', 'error');
      }
    }
  };

  const handleRenameSession = async (id: string, newName: string) => {
    setSessions(prev =>
      prev.map(s => (s.id === id ? { ...s, name: newName, lastModified: Date.now() } : s))
    );
    if (supabase && user) {
      const { error } = await supabase
        .from('sessions')
        .update({ name: newName, last_modified: new Date().toISOString() })
        .eq('id', id);
      if (error) debugLog.error('App', 'Error renaming session', error);
    }
  };

  const handleSaveSession = (updatedSession: Session) => {
    const withFlag = { ...updatedSession, isFullyLoaded: true as const };
    setSessions(prev => prev.map(s => (s.id === withFlag.id ? withFlag : s)));
    if (workspaceSession?.id === withFlag.id) {
      setWorkspaceSession(withFlag);
    }
  };

  const handleUpdateSessionImage = async (sessionId: string, image: string) => {
    setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, thumbnail: image } : s)));
    if (supabase && user) {
      const { error } = await supabase
        .from('sessions')
        .update({ thumbnail: image })
        .eq('id', sessionId);
      if (error) debugLog.error('App', 'Error updating session thumbnail', error);
    }
  };

  const handleUpdateSessionIcon = async (sessionId: string, icon: string) => {
    setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, icon } : s)));
    if (supabase && user) {
      const { error } = await supabase.from('sessions').update({ icon }).eq('id', sessionId);
      if (error) debugLog.error('App', 'Error updating session icon', error);
    }
  };

  const handleGoHome = () => {
    setActiveSessionId(null);
    setWorkspaceSession(null);
    setView(user ? 'dashboard' : 'landing');
  };

  const handleSwitchAccount = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(undefined);
    setSessions([]);
    setActiveSessionId(null);
    setWorkspaceSession(null);
    setView('landing');
    clearLoader();
    setIsDashboardLoaded(false);
    initialFetchDoneRef.current = false;
    heavyLoadedForRef.current = null;
    localStorage.removeItem('mindcanvas_sessions');
    localStorage.removeItem('last_active_session_id');
    localStorage.removeItem('current_view');
    localStorage.removeItem('pending_session_id');
    setIsAuthModalOpen(true);
  };

  if (loadingState) {
    return <LoadingOverlay variant={loadingState.phase} message={loadingState.message} />;
  }

  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onGetStarted={() => {
            if (user) {
              setView('dashboard');
            } else {
              handleLogin();
            }
          }}
          onGoShards={() => setView('shards')}
        />
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  if (view === 'workspace' && workspaceSession) {
    return (
      <>
        <ErrorBoundary
          label="workspace"
          fallback={
            <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-4">
              <p className="text-lg font-semibold text-red-400">The workspace encountered an error.</p>
              <button
                onClick={() => { setWorkspaceSession(null); setView('dashboard'); }}
                className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm"
              >
                Back to Dashboard
              </button>
            </div>
          }
        >
          <Suspense fallback={<LoadingOverlay variant="workspace" message="Loading workspace UI…" />}>
            <Workspace
              key={workspaceSession.id}
              session={workspaceSession}
              onSave={handleSaveSession}
              onBack={() => {
                setActiveSessionId(null);
                setWorkspaceSession(null);
                setView('dashboard');
              }}
              onGoHome={handleGoHome}
              user={user}
              onLogin={handleLogin}
              onLogout={handleLogout}
              onSwitchAccount={handleSwitchAccount}
              onGoShards={() => setView('shards')}
            />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  }

  if (view === 'shards') {
    return (
      <ShardsPage
        onBack={() => {
          setView(activeSessionId ? 'workspace' : 'dashboard');
        }}
      />
    );
  }

  return (
    <>
      <Header
        isWorkspace={false}
        onGoHome={handleGoHome}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSwitchAccount={handleSwitchAccount}
        onGoShards={() => setView('shards')}
      />
      <SessionList
        sessions={sessions}
        isLoading={false}
        userId={user?.id}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
        onRename={handleRenameSession}
        onUpdateSessionImage={handleUpdateSessionImage}
        onUpdateSessionIcon={handleUpdateSessionIcon}
      />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}

export default App;
