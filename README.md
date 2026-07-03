# ENVAL

ENVAL is being restarted with a controlled rebuild inside this existing repository.

## Current Production Surface

The current live website is the existing static Netlify site in the repository root. Files such as `index.html`, `aanmelden.html`, `dossier.html`, `regelgeving.html`, `assets/js/**`, and `assets/css/**` are legacy/production assets for now.

Do not change those files casually. They remain the active production surface until a migration is explicitly approved.

## New Development Surface

New frontend development happens in `/app`.

The `/app` project is an isolated Vite app intended for local development and rebuild work. It is not connected to Netlify production deploy behavior yet.

The ENVAL Vite dev server always runs on port `5175`:

```bash
cd app
npm run dev
```

Local URL:

```text
http://localhost:5175/
```

Ports `5173` and `5174` are reserved for other local projects.

The ENVAL UI is being redesigned professionally from scratch. The existing root static site is content/reference material and a production fallback, not the target architecture or final visual system.

## Backend Surface

Supabase remains in `/supabase`.

Existing Supabase Edge Functions and migrations are shared backend assets. They are not part of the initial frontend rebuild unless a task explicitly includes backend work.

## Documentation

Documentation is being normalized into concise source-of-truth files under `docs/`.

The existing `docs/documenten/` folder remains historical/source material until it is reviewed and migrated deliberately.

## Production Deploy Rule

Do not change `netlify.toml`, `_redirects`, or production routing/deploy behavior until explicitly approved.
