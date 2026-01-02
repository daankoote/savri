// /config.js
// Enige bron van waarheid voor Supabase config (GEEN modules, GEEN exports)

window.ENVAL = window.ENVAL || {};

window.ENVAL.SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co";

// ✅ Jouw echte anon key (die je net uit Supabase haalde)
window.ENVAL.SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bmdydXJrcGZ1cWdleGJoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjYxMjYsImV4cCI6MjA4MDg0MjEyNn0.L7atEcmNvX2Wic0eSM9jWGdFUadIhH21EUFNtzP4YCk";

window.ENVAL.API_BASE = `${window.ENVAL.SUPABASE_URL}/functions/v1`;

window.ENVAL.edgeHeaders = function edgeHeaders(extraHeaders) {
  const key = window.ENVAL.SUPABASE_ANON_KEY;
  const h = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (extraHeaders && typeof extraHeaders === "object") {
    Object.assign(h, extraHeaders);
  }
  return h;
};

// Debug helper (optioneel)
window.ENVAL.debugAnonIss = function () {
  try {
    return JSON.parse(atob(window.ENVAL.SUPABASE_ANON_KEY.split(".")[1])).iss;
  } catch (e) {
    return "decode_failed";
  }
};
