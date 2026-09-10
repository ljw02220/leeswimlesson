const SUPABASE_URL = 'https://icfcwcqzbjqxkrgqyfha.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PhldwnZZ2ZiHV6vlUYiaJA_YWc1NxzE';

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

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

window.swimDb = {
  client: createSupabaseClient(),
  isConfigured: isSupabaseConfigured,
};
