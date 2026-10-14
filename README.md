# JobLinked — Demo

A **frontend-only, 1:1 copy** of the JobLinked / PESO job portal. No backend, no
database, no authentication — every screen renders with mock data so the whole
product can be browsed or screenshotted end to end.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## How to look around

1. `/` — the public landing page (job seekers in Santa Maria, Bulacan).
2. `/jobs` — the public job board with filters.
3. `/portals` — the **role picker**. This is the entry point for the three
   portals. Pick one; the login screen's **Sign In** button is a redirect — there
   is no authentication, it just takes you into that portal.
4. `/employer`, `/job-seeker`, `/super-admin` — the three portals. You can also
   deep-link straight to any of their pages.

Everything is interactive against in-memory data: apply to a job, move an
applicant through its statuses, create or duplicate a job post, mark
notifications read, submit an accreditation, export a report. Changes last for
the session and reset on reload.

## What's real, what's mocked

| Real (byte-identical to `src/`) | Mocked |
|---|---|
| All 78 components, routes, layouts, Tailwind theme | `src/shared/lib/api.js` — in-memory router over the seed data |
| `src/shared/services/*` — untouched | `src/shared/lib/mockData.js` — the seed dataset |
| `src/shared/utils/*`, `constants.js`, hooks | `src/shared/lib/supabase.js` — auth stub |
| Resume text extraction (PDF/DOCX, client-side) | `src/shared/context/AuthProvider.jsx` — demo user derived from the URL |
| `ProtectedRoute` (always allows, demo) | AI help chat — canned replies |
| `Login.jsx` — the button redirects | Facebook posting — no-op |

The full list of deliberate deviations and the reasoning behind each is in
[`SPEC.md`](./SPEC.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | 63 tests: mock data, mock API, and a jsdom mount of all 40 routes |
| `npm run lint` | ESLint |

## Tests

`npm test` includes `src/__tests__/routes.smoke.test.jsx`, which mounts the real
app (the real `AuthProvider`, the real `BrowserRouter`, the real components
against the real mock data) and renders **all 40 routes**. It found two genuine
bugs during the build, both fixed and documented in `SPEC.md`.

## Deploying

`npm run build` produces a plain static SPA in `dist/`. It has no server-side
runtime, no environment variables, and no secrets — drop `dist/` on any static
host (GitHub Pages, Netlify, Vercel, S3, nginx).
