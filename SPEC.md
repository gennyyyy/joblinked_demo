# JobLinked Demo (frontend-only) — Design Spec

**Date:** 2026-10-14
**Status:** Approved for planning
**Owner:** Lead Architect

## Intent

Build a **1:1 frontend-only demo** of the JobLinked / PESO job portal inside
`demo_version/`. No backend, no authentication, no database. Every screen must
render exactly like the real system, populated with mock data, so the app can be
showcased or screenshotted end to end.

Success criteria:
- Every component from `src/` exists in the demo and renders identically.
- All three portals (super-admin, employer, job-seeker) plus the public site are
  browsable with zero setup: `npm install && npm run dev`.
- Interactive flows (apply to a job, change an application status, post a job,
  mark notifications read) work against in-memory mock state.

## Approach: full copy, mock data layer

The demo is a **copy of `src/`** with the data layer swapped. Components are
untouched — that is what makes it a true 1:1 copy.

```
demo_version/
├── index.html
├── package.json            # no @supabase/supabase-js, no server deps
├── vite.config.js
├── public/                 # favicon.svg, icons.svg (copied)
├── SPEC.md
├── PLAN.md
└── src/
    ├── main.jsx            # identical
    ├── App.jsx             # identical except PublicRoute is demo-relaxed
    ├── index.css           # identical
    ├── assets/             # copied
    ├── features/           # ALL components copied identically
    └── shared/
        ├── components/     # identical except ProtectedRoute
        ├── context/AuthProvider.jsx   # MOCK — user derived from URL pathname
        ├── hooks/          # identical
        ├── lib/
        │   ├── api.js      # MOCK — path router over in-memory store
        │   ├── mockData.js # MOCK — seed dataset + demo users
        │   └── supabase.js # MOCK — auth stub + empty table stub
        ├── services/       # identical — they call api.js, which is mocked
        └── utils/          # identical
```

## Decisions

### D1 — Only the data layer is mocked
`src/shared/services/*.js` are copied verbatim; they already funnel every read
and write through `api.js`. Replacing `api.js` therefore mocks the whole system
with one file and zero component edits.

### D2 — One mock data file, seeded in-memory store
`src/shared/lib/mockData.js` holds the seed dataset and the three demo users.
The mock `api.js` keeps a mutable in-memory copy so interactive writes (apply,
status change, create job, mark-read) persist for the session.

### D3 — Role comes from the URL, not a login
`PortalSelect` is the existing role picker and stays as-is. `Login.jsx`'s submit
button becomes a redirect to the portal home (`/${portalKey}`) instead of calling
auth — per the user's instruction. `ProtectedRoute` renders children
unconditionally in the demo (no redirect loop). `AuthProvider` derives the demo
user from `window.location.pathname` (`/employer` → demo employer, etc.) so any
deep link works.

`logout()` is a no-op in the demo so the AFK timer in `useAFKTimer` cannot eject
a viewer mid-demo (`# ponytail:` comment marks this).

### D4 — Mock supabase, not its removal
Four components call `supabase.auth.*` directly (`AuthCallback`, `AcceptInvite`,
`ResetPassword`, `services/auth.js`, `services/facebook.js`). A stub that
implements `auth.{getSession,onAuthStateChange,signInWithPassword,signUp,signOut,
getUser,updateUser,refreshSession,resetPasswordForEmail}` and a no-op
`from(table)` chain keeps those pages rendering with no component edits.

### D5 — Serialization fidelity
Mock responses copy the real serialization quirks: `salary_min`/`salary_max` as
strings, bigint ids (`notifications.id`, `audit_logs.id`, `reference_data.id`,
`*_status_history.id`) as strings, `date` columns as ISO date strings,
`timestamptz` as ISO strings. Components that format or sort these depend on it.

### D6 — No tests copied
The source `__tests__` directories are excluded from the copy (they assert
server contracts against the real `api.js`/`supabase.js`). The demo gets ONE
focused test asserting the mock layer returns the documented shapes for
`auth/me`, `jobs`, `admin/stats`, and `notifications/mine`.

## Mock API surface (must cover)

Path → response (from `server/src/routes/*`, all prefixed `/api/`):

| Method | Path | Response |
|---|---|---|
| GET | auth/me | profile row + `role`, per role (see D5 fields) |
| GET | employers/me | full `employers` row |
| GET | seeker-in-scope: seekers/me, seekers/me/education, seekers/me/experience, seekers/me/employment | row / arrays |
| GET | jobs | `{ jobs, total, page, pageSize }` (envelope, default status=published) |
| GET | jobs/:id | single job |
| GET/POST/DEL | employers/:id/jobs | array w/ `applicant_count` / job / `{deleted:true}` |
| POST/PATCH | jobs | job / `{deleted:true, applications:n}` |
| POST | jobs/:id/status, jobs/:id/duplicate | job |
| GET | applications/mine, applications/company/:id, applications/seekers/:id/education \| experience | arrays (embeds per contract) |
| POST | applications, applications/:id/status | 201 flat subset / full app w/ seeker |
| GET | admin/stats | 14 numeric fields |
| GET | admin/users, admin/companies, admin/jobs, admin/applications, admin/employees, admin/referrals, admin/accreditations, admin/audit-logs, admin/roles, admin/reference/:cat | bare arrays, embeds per contract |
| POST/PATCH/DEL | admin/users/:id, admin/jobs/:id(+publish/unpublish), admin/roles, admin/reference, admin/users/:id/role, admin/users/:id/custom-role, admin/system-notifications, admin/users/invite | rows / `{deleted:true}` / `{invited:true}` / `{sent:n}` / `{id,role}` |
| GET | notifications/mine | array (per current user) |
| POST/DEL | notifications/:id/read, notifications/read-all, notifications/:id | `{read:true}` / `{deleted:true}` |
| GET/POST/DEL | files/resumes/mine, files/resumes, files/resumes/:id/activate, files/resumes/:id | arrays / `{path,resume}` / rows / `{deleted:true}` |
| GET/POST/PATCH | accreditations, accreditations/company/:id | rows/arrays |
| GET/POST/PATCH | documents, documents/company/:id | rows/arrays |
| POST | ai/help | `{ reply }` |
| POST | audit | 204 |
| blob | admin/reports/:type/export | Blob (CSV string) |

## Demo dataset

IDs are shared across tables so joins resolve: one super-admin, one employer
(the demo employer's user id equals its `employers.id`), one job-seeker. Data
volume: ~5 employers, ~12 job seekers, ~18 jobs across statuses, ~40
applications across all 7 statuses, ~20 notifications, audit logs, roles,
reference data, education/experience/employment, resumes, documents,
accreditations.

## Deviations from a pure copy (7 data-layer files, all deliberate)

| File | Change | Why |
|---|---|---|
| `src/shared/lib/api.js` | Replaced with an in-memory mock router | Sole data path for the whole app — mocking it mocks every service |
| `src/shared/lib/mockData.js` | New — seed dataset + `DEMO_USERS` | The demo's data |
| `src/shared/lib/supabase.js` | Replaced with an auth stub | Removes the Supabase dependency; keeps `services/auth.js` and the reset/invite pages rendering |
| `src/shared/context/AuthProvider.jsx` | Replaced — demo user derived from the URL pathname | No login needed; deep links work |
| `src/shared/components/ProtectedRoute.jsx` | Renders children unconditionally | No redirect loop without auth |
| `src/features/auth/Login.jsx` | Submit button redirects to the portal | The login button is a redirect button (user's instruction) |
| `src/App.jsx` | `PublicRoute` returns children; `<AuthProvider>` mounted **inside** `<BrowserRouter>` | Public pages can't gate on a session; the mock provider uses `useLocation()`, which needs a router ancestor |
| `src/main.jsx` | No longer wraps `<App/>` in `<AuthProvider>` | The provider now lives inside `App`'s router (see above) |

Everything else — all 78 remaining source files — is **byte-identical** to
`src/` (verified by SHA-256 comparison).

## Bugs found by the route smoke test and fixed

The smoke test (`src/__tests__/routes.smoke.test.jsx`) mounts the real app
composition and renders all 40 routes. It surfaced two real defects during the
build, both now fixed:

1. **`useLocation()` outside a router.** The mock `AuthProvider` rendered above
   `App`'s `<BrowserRouter>` and threw on mount — a white screen. Fixed by moving
   the provider inside the router (`App.jsx`) and dropping the wrapper from
   `main.jsx`.
2. **`requirements`/`benefits` type mismatch.** The mock stored them as arrays;
   every consumer calls `.split("\n")` on the newline-joined text the Postgres
   `text` column actually returns, so `PublicJobDetail` and `JobDetail` crashed
   with `job.requirements.split is not a function`. Fixed in the data (joined
   strings, plus an `Education:`/`Experience:` line per job so the employer edit
   form hydrates) — never in the components.

## Verification

- `npx vitest run` — 63/63 (mock data, mock API, and a jsdom mount of all 40 routes)
- `npm run lint` — clean
- `npm run build` — clean
- Cross-reference script: file parity, SHA-256 content identity of all 78 copied
  files, 256 relative imports resolved, zero Supabase imports or dependencies


Backend, Postgres, Supabase project, real auth, real file storage, real AI,
real Facebook posting, source `__tests__`.
