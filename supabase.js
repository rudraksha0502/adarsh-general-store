// ─────────────────────────────────────────────
//  supabase.js  —  Supabase client initialisation
// ─────────────────────────────────────────────

const SUPABASE_URL  = "https://fghjsmevbdypjgzbigti.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGpzbWV2YmR5cGpnemJpZ3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NTkxMDIsImV4cCI6MjA2MTIzNTEwMn0.hJBMBFBhSHf9MFQ4cLhJFSL7B4bGwItTQ5jPpKqMFik";

// The Supabase JS library is loaded via CDN in each HTML file.
// window.supabase is the global from the CDN.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
