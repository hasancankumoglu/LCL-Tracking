import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Supabase proje URL'i ve anon key - bunlar public/embeddable olacak şekilde tasarlanmıştır
// (gerçek erişim kontrolü Postgres Row Level Security politikalarıyla sağlanır, bkz.
// supabase/sql/002_rls_and_functions.sql). service_role key BURADA ASLA KULLANILMAZ.
const SUPABASE_URL = 'https://nkqfognrnayaiyzitrpo.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rcWZvZ25ybmF5YWl5eml0cnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzQzOTQsImV4cCI6MjEwNzU1MDM5NH0.P0e2Eeg6n0w9UBtXtWrSqOKIsmQPSN6ubLhXr9QWo4Q'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  })
  return client
}
