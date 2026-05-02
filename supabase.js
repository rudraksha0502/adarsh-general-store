// ─────────────────────────────────────────────
//  supabase.js  —  Supabase client initialisation
// ─────────────────────────────────────────────

const SUPABASE_URL  = "https://fghjsmevbdypjgzbigti.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGpzbWV2YmR5cGpnemJpZ3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDU2NDYsImV4cCI6MjA5Mjc4MTY0Nn0.Pbp_sfEJLqyKRAv3LPMCVMDBz4s6qd3BrsVfJQB8xJk";

// The Supabase JS library is loaded via CDN in each HTML file.
// window.supabase is the global from the CDN.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
