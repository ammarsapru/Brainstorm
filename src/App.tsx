// Create new session
const handleCreateSession = async () => {
  // Ensure we have a user (or handle potentially via anon if needed, but DB requires user_id)
  if (!user && !supabase) {
    // Fallback for demo mode without supabase
  } else if (!user) {
    alert("You must be logged in to create a session.");
    return;
  }

  // Ensure profile exists before creating session
  if (supabase && user) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      if (error || !profile) {
        console.warn('Profile not found, creating...', error);
        // Manually insert profile if trigger failed
        const { error: upsertError } = await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        });
        
        if (upsertError) {
          console.error('Failed to create profile:', upsertError);
          alert('Failed to create session. Please try again.');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      alert('Failed to create session. Please try again.');
      return;
    }
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
