import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
if (!supabasePublishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured');

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  realtime: {
    transport: ws
  }
});