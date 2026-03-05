// scripts/gen-runtime-config.js
// Genereert assets/js/config.runtime.js tijdens build (Netlify)
// GEEN secrets: SUPABASE_ANON_KEY is publiek (anon), maar blijft runtime-inject.

import fs from "node:fs";
import path from "node:path";

function reqEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) {
    console.error(`[gen-runtime-config] Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = reqEnv("SUPABASE_ANON_KEY");

const outPath = path.join(process.cwd(), "assets", "js", "config.runtime.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const content =
`// AUTO-GENERATED at build time. DO NOT COMMIT.
// Source: Netlify environment variables.
// Version: ${new Date().toISOString()}
window.ENVAL = window.ENVAL || {};
window.ENVAL.SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
window.ENVAL.SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};
`;

fs.writeFileSync(outPath, content, "utf8");
console.log(`[gen-runtime-config] wrote ${outPath}`);