import { createClient } from "@supabase/supabase-js";

export const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when the app runs in demo mode (no Supabase project configured).
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
