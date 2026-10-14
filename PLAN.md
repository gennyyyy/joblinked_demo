# Demo Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A frontend-only, 1:1 copy of the JobLinked portal in `demo_version/` — no backend, no auth, no database, everything driven by mock data.
**Architecture:** Copy `src/` verbatim; swap only the data layer (`api.js`, `supabase.js`, `AuthProvider.jsx`, `ProtectedRoute.jsx`, `App.jsx`'s `PublicRoute`, `Login.jsx` submit). One `mockData.js` seed file + one in-memory store in the mocked `api.js`.
**Tech Stack:** Vite 8, React 19, react-router-dom 7, Tailwind 4, lucide-react, Vitest.
**Spec:** `demo_version/SPEC.md`

## Global Constraints

- Components are copied **byte-identical** except the six data-layer files listed below. No component rewording, no prop changes, no style changes.
- No new runtime dependency. No `@supabase/supabase-js`.
- Do not copy any `__tests__` directory from the source tree.
- `demo_version/` root is the Vite project root (the previous `demo_version/joblinked demo/` scaffold is removed).
- Mock responses keep the server's serialization quirks: `salary_min`/`salary_max` strings, bigint ids (`notifications.id`, `audit_logs.id`, `reference_data.id`, `job_status_history.id`, `education.id`, `work_experience.id`) strings, `date` columns `YYYY-MM-DD`, `timestamptz` ISO strings.
- Every `api.*` call returns a deep clone; mutations land in the in-memory store so interactive flows persist for the session.

## Pinned Interfaces

### `src/shared/lib/mockData.js` (new)

```js
export const DEMO_USERS = {
  'super-admin': { id, first_name, middle_name, last_name, suffix, full_name, email, status, custom_role_id, created_at, updated_at, role: 'super-admin' },
  employer:       { /* employers row shape + */ role: 'employer' },
  'job-seeker':   { /* job_seekers row shape + */ role: 'job-seeker' },
};
// Returns a fresh mutable store object with these exact keys:
export function createStore() {
  return {
    admins: [],            // super_admins rows
    employers: [],         // employers rows (DEMO_USERS.employer is employers[0])
    seekers: [],           // job_seekers rows (DEMO_USERS['job-seeker'] is seekers[0])
    jobs: [],              // job_vacancies rows (incl. employers embed)
    applications: [],      // job_applications rows (incl. job + seeker embeds)
    notifications: [],     // notifications rows (user_id matches the demo users)
    education: [],         // education rows
    experience: [],        // work_experience rows
    employmentHistory: [], // employment_history rows
    resumes: [],           // resumes rows
    documents: [],         // employer_documents rows
    accreditations: [],    // employer_accreditations rows
    roles: [],             // reshaped custom roles (admin.js shape)
    referenceData: [],     // reference_data rows
    auditLogs: [],         // audit_logs rows (+ actor_name, actor_email)
    facebookPosts: [],     // facebook_posts rows
    facebookIntegration: null, // or { id, page_id, page_name, status, auto_post }
  };
}
```

Shared ids so every join resolves: `DEMO_USERS.employer.id === employers[0].id === jobs[*].company_id`,
`DEMO_USERS['job-seeker'].id === seekers[0].id`, notifications carry `user_id` of all three.

### `src/shared/lib/api.js` (replaced)

```js
export const api = {
  get:    (path, params) => Promise<value>,   // 'jobs' → { jobs, total, page, pageSize }
  post:   (path, body)   => Promise<value>,
  patch:  (path, body)   => Promise<value>,
  del:    (path)         => Promise<value>,   // { deleted: true, ... }
  blob:   (path)         => Promise<Blob>,    // CSV string → new Blob([csv], {type:'text/csv'})
};
```
Path router keyed on the real server's path list (see SPEC "Mock API surface"). Reads return deep clones. Writes mutate `store` and return the affected row(s). Unknown path → `Promise.reject` with `{ status: 404, message: 'Route not found' }`.

### `src/shared/lib/supabase.js` (replaced)

```js
export const supabase = {
  auth: {
    onAuthStateChange: (cb) => { /* calls cb('INITIAL_SESSION', null) async; returns { data: { subscription: { unsubscribe(){} } } } */ },
    getSession: () => Promise<{ data: { session: null } }>,
    signInWithPassword: ({ email }) => Promise<{ data: { user: match(email) || anonymousUser, session: {} }, error: null }>,
    signUp: ({ email, options }) => Promise<{ data: { user: anonymousUser, session: {} }, error: null }>,
    signOut: () => Promise<{ error: null }),
    getUser: () => Promise<{ data: { user: anonymousUser } }>,
    updateUser: () => Promise<{ data: {}, error: null }),
    refreshSession: () => Promise<{ data: { session: null }, error: null }),
    resetPasswordForEmail: () => Promise<{ data: {}, error: null }),
  },
  from: (table) => chainableNoop, // select/insert/update/eq/order/maybeSingle → thenable { data: null, error: null }
};
```

### `src/shared/context/AuthProvider.jsx` (replaced)

Same exported component signature. `user` derived from pathname:

```js
const ROLE_SEGMENTS = ['super-admin', 'employer', 'job-seeker'];
// role = null when the first path segment isn't a portal, or the path is exactly
// `/${seg}/login` (so the login screen renders as guest).
```
`role`, `logout` (no-op — see ponytail note), `refreshUser` (resolves the user), `loading: false`.

### `src/shared/components/ProtectedRoute.jsx` (replaced)

Renders `children` unconditionally; keeps the `role` prop and the same import surface. No `useAuth` call, no `Navigate`.

### `src/App.jsx` (replaced, otherwise identical)

`PublicRoute` renders `children` unconditionally (no `useAuth`, no `LoadingScreen` gate).

### `src/features/auth/Login.jsx` (replaced, otherwise identical)

`handleSubmit` becomes:

```js
function handleSubmit(event) {
  event.preventDefault();
  navigate(portal.homePath);   // redirect button — auth removed in the demo
}
```
Drop `signIn`, `useAuth`, `LoadingScreen` imports and the now-unused `error`/`busy`/`resetDone` state. Keep every class name, label, and link byte-identical.

---

### Task 1: Scaffold the demo project

**Files:** create `demo_version/{package.json,vite.config.js,index.html,.env.example}`, `demo_version/public/*`, `demo_version/eslint.config.js`; copy `src/` (minus `__tests__`, minus the six replaced files).

- [x] Step 1: Remove `demo_version/joblinked demo/` (old scaffold). — done
- [x] Step 2: Copy `src/` (80 files, minus `__tests__`, minus the replaced files). — done
- [x] Step 3: Verify the copy: file sets + SHA-256 content identity. — done (78/78 identical)
- [x] Step 4: `package.json` — done (no supabase/concurrently/testing-library)
- [x] Step 5: `vite.config.js` — done
- [x] Step 6: `index.html` — done
- [x] Step 7: `public/` + `eslint.config.js` — done
- [x] Step 8: Scaffold committed — see note below
  `.env.example` intentionally omitted: the demo reads no environment variables.

## Status: all tasks complete

Verification actually run (latest):
- `npx vitest run` → **63/63 passed** (mock data, mock API, jsdom mount of all 40 routes)
- `npm run lint` → exit 0
- `npm run build` → clean
- Cross-reference script → parity PASS / imports PASS / deps PASS
  (78 copied files byte-identical, 256 relative imports resolve, 0 Supabase imports)
- `vite preview` → all 40 routes + assets return 200 with the SPA shell

Bugs found by the route smoke test during the build and fixed: see `SPEC.md`
§ "Bugs found by the route smoke test and fixed".

### Git
Not committed — `demo_version/` is currently untracked in this repo and the
root `eslint.config.js` ignores it. Suggested commit once you're happy:
```
git add demo_version && git commit -m "feat: frontend-only demo with mock data"
```

### Task 2: Seed dataset

**Files:** create `demo_version/src/shared/lib/mockData.js`
**Interfaces:** produces `DEMO_USERS`, `createStore()` exactly as pinned above.

- [ ] Step 1: Write `DEMO_USERS` for the three roles with the per-role field sets from `GET /api/auth/me`.
- [ ] Step 2: Write `createStore()` with 5 employers, 12 seekers, 18 jobs across all 7 `job_status` values (≥5 `published`), 40 applications across all 7 `application_status` values, 20 notifications (≥5 unread, ids as strings), 4 education rows, 4 experience rows, 3 employment-history rows, 2 resumes (one `is_active`), 6 documents, 4 accreditations (mixed statuses, one with `decided_by` embedded), 3 custom roles, 10 reference_data rows, 12 audit logs, 3 facebook posts, `facebookIntegration` set.
- [ ] Step 3: Cross-link every id: `applications[*].job`/`seeker` embeds, `applications[*].seeker_id`, `jobs[*].employers`, `notifications[*].user_id`, `education[*].seeker_id`, `resumes[*].seeker_id`, `documents[*].company_id`.
- [ ] Step 4: Write `demo_version/src/shared/lib/__tests__/mockData.test.js` asserting `DEMO_USERS.employer.id === createStore().employers[0].id` and that every `applications[*].seeker_id` resolves to a seeker in the store.
- [ ] Step 5: `npx vitest run src/shared/lib/__tests__/mockData.test.js` → PASS.
- [ ] Step 6: Commit `feat(demo): seed mock dataset`.

### Task 3: Mock API layer

**Files:** create `demo_version/src/shared/lib/api.js`
**Interfaces:** consumes `createStore()`; produces `api` exactly as pinned above.

- [ ] Step 1: Write the router: exact-match table plus `/^jobs\/([^/]+)$/`, `/^employers\/([^/]+)\/jobs$/`, `/^applications\/company\/([^/]+)$/`, `/^admin\/[^/]+$/` and the other parameterised paths from the SPEC table.
- [ ] Step 2: Reads return deep clones; enforce the documented filters (`jobs` default `status=published` + envelope; `admin/users` `?role=`; `notifications/mine` filters by the current demo user's id and honours `unreadOnly`).
- [ ] Step 3: Writes mutate the store: `POST applications` unshifts a new application (409 on duplicate `job_id`+`seeker_id`); `POST applications/:id/status` updates status/notes; `POST jobs` unshifts a job; `PATCH`/`DELETE` by id; `POST notifications/:id/read` + `read-all` flip `is_read`; `POST ai/help` returns `{ reply }` from a small canned map; `POST admin/system-notifications` returns `{ sent }`.
- [ ] Step 4: `blob()` returns a real `Blob` of CSV text for `admin/reports/:type/export`.
- [ ] Step 5: Write `demo_version/src/shared/lib/__tests__/mockApi.test.js` asserting: `GET auth/me` returns `DEMO_USERS.employer` with `role: 'employer'`; `GET jobs` returns the envelope with `total`/`page`/`pageSize` and only `published` jobs; `GET jobs/:id` returns the single job; `GET admin/stats` returns 13 numeric fields; `GET notifications/mine` only returns rows for the current user; `POST applications` then `GET applications/mine` shows the new row; `POST applications` twice → rejects 409; `api.blob('admin/reports/vacancies/export?format=csv')` resolves to a Blob.
- [ ] Step 6: `npx vitest run src/shared/lib/__tests__/mockApi.test.js` → PASS.
- [ ] Step 7: Commit `feat(demo): mock api layer`.

### Task 4: Mock auth + route guards — DONE

**Files:** replaced `demo_version/src/shared/lib/supabase.js`, `demo_version/src/shared/context/AuthProvider.jsx`, `demo_version/src/shared/components/ProtectedRoute.jsx`, `demo_version/src/App.jsx`, `demo_version/src/features/auth/Login.jsx`, and additionally `demo_version/src/main.jsx` (see note).

- [x] Step 1: `supabase.js` — auth stub.
- [x] Step 2: `AuthProvider.jsx` — pathname-derived demo user, `loading: false`, no-op `logout` with the ponytail note.
- [x] Step 3: `ProtectedRoute.jsx` — render children unconditionally, keep the `role` prop.
- [x] Step 4: `App.jsx` — `PublicRoute` returns children; `<AuthProvider>` mounted **inside** `<BrowserRouter>`.
- [x] Step 5: `Login.jsx` — redirect-on-submit; UI otherwise identical.
- [x] Step 6: `npx vitest run` → PASS (63/63).
- [x] Step 7: Committed — see Task 5 note on git.

Extra deviation beyond the pinned interfaces: the mock `AuthProvider` calls
`useLocation()`, which requires a Router ancestor. Mounting it in `main.jsx`
above `App`'s `<BrowserRouter>` threw on load (white screen) — found by the route
smoke test. Fixed by keeping the provider inside `App` and dropping the wrapper
from `main.jsx`.

### Task 5: Build, lint, and cross-reference

- [ ] Step 1: `npm install` in `demo_version/`.
- [ ] Step 2: `npm run build` → clean build, no unresolved imports.
- [ ] Step 3: `npm run lint` → zero errors.
- [ ] Step 4: Cross-reference: script that lists every `.jsx/.js` file under the source `src/` and under `demo_version/src/` and diffs the sets; every source file must exist in the demo except the six replaced files and every `__tests__`.
- [ ] Step 5: Cross-reference imports: parse every import specifier in `demo_version/src/**` and assert each relative target exists.
- [ ] Step 6: `npm run preview` smoke test: fetch `/`, `/jobs`, `/portals`, `/employer/login`, `/employer`, `/job-seeker`, `/super-admin` — each returns the SPA shell with status 200.
- [ ] Step 7: Commit `chore(demo): verify build, lint, parity`.

## Review Focus

- **Deep links:** `/job-seeker/jobs/<uuid>`, `/employer/applicants`, `/super-admin/reports` must render with no console error — the demo user must resolve on any portal path, not just the index route.
- **Public job detail for a non-published job:** `PublicJobDetail` must not crash when the mock returns 404 for a draft id.
- **Empty results:** `admin/users?role=` filters and `notifications/mine?unreadOnly=true` must degrade to empty lists, not throw.
- **Register / forgot-password / accept-invite / auth-callback flows:** these still call the mocked `supabase` — they must render and resolve without hanging on a pending promise.
- **Numeric/string parity:** a component doing `job.salary_min.toLocaleString()` or sorting by id must not break on the mocked string-typed values.
