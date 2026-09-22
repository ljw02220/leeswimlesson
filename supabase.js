const SUPABASE_URL = 'https://icfcwcqzbjqxkrgqyfha.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PhldwnZZ2ZiHV6vlUYiaJA_YWc1NxzE';
const LOGIN_PREFERENCE_KEY = 'swimRememberLogin';

const supabaseAuthStorage = {
  getItem(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  },
  setItem(key, value) {
    if (localStorage.getItem(LOGIN_PREFERENCE_KEY) === 'true') {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

function isSupabaseConfigured() {
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
    Boolean(window.supabase)
  );
}

function createSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: supabaseAuthStorage,
    },
  });
}

window.swimDb = {
  client: createSupabaseClient(),
  isConfigured: isSupabaseConfigured,
};
