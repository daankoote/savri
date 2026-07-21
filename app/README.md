# ENVAL Vite App

This is the isolated ENVAL Vite development app.

It is not connected to Netlify production yet. The existing static root website remains the current production surface and must stay untouched until a migration is explicitly approved.

Current product and implementation canon starts at:

```text
../docs/app/00_CANON.md
```

The former in-repo legacy documentation tree has been removed after external copy by Daan. It must not drive new `/app` implementation.

## Install

```bash
npm install
```

## Run Local Dev

```bash
npm run dev
```

This always runs on:

```text
http://localhost:5175/
```

Ports `5173` and `5174` are reserved for other local projects. Do not use a different ENVAL Vite port unless explicitly agreed.

## Typecheck

```bash
npm run typecheck
```

## Build

```bash
npm run build
```

## Notes

- Safe public environment placeholders are documented in `.env.example`.
- Do not commit real `.env` or `.env.local` files.
- Do not change root Netlify/static production behavior from this app.
- The new UI will be redesigned professionally from scratch. The old static site is content/reference material, not the target visual system.
