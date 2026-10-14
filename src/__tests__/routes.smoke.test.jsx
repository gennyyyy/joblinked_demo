import { it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App.jsx'
import { createStore } from '../shared/lib/mockData.js'

// ---------------------------------------------------------------------------
// The demo IS mounted the way its own main.jsx does it: `<AuthProvider><App/></AuthProvider>`,
// with the provider living inside App's <BrowserRouter> so its useLocation() resolves.
// App's BrowserRouter reads window.location.pathname, so each test pushStates to the
// route first — no outer router (nesting one throws).
// ---------------------------------------------------------------------------

// react-dom's act() needs this flag in a plain vitest/jsdom environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Route-level code-splitting uses React.lazy + Suspense, so real content only
// appears after the dynamic import resolves; data pages then load via Promise-based
// mocks. Poll on real timers (vite's module runner needs wall-clock time — a cold
// run must transform/optimise each page module once; microtask-only flushing is not
// enough) until the Suspense fallback ("Loading database…") is gone, i.e. the page
// has actually mounted. The generous cap only bites a page that never mounts.
async function flushUntilSettled(container) {
  const deadline = Date.now() + 12000
  for (;;) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })
    if (!container.innerHTML.includes('Loading database')) {
      // one more tick so child data-loading effects flush into the DOM
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40))
      })
      return container.innerHTML
    }
    if (Date.now() > deadline) return container.innerHTML
  }
}

// Render one route and return its HTML. BrowserRouter inside App reads
// window.location.pathname, so set it with pushState first (no outer router).
// A genuine render crash is re-thrown with the route named — never swallowed.
async function renderAt(path) {
  window.history.pushState({}, '', path)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(<App />)
    })
    return await flushUntilSettled(container)
  } catch (err) {
    throw new Error(`Route "${path}" failed to render: ${err?.message ?? err}`, { cause: err })
  } finally {
    try {
      await act(async () => root.unmount())
    } catch {
      /* ignore unmount races */
    }
    container.remove()
  }
}

// --- test data --------------------------------------------------------------
const store = createStore()
const publishedJobId = store.jobs.find((j) => j.status === 'published').id

// Every route in App.jsx's table.
const routes = [
  // public + auth
  '/',
  '/jobs',
  `/jobs/${publishedJobId}`,
  '/portals',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/register/job-seeker',
  '/register/employer',
  '/register/employer/status',
  '/auth/callback',
  // portal logins (guest)
  '/super-admin/login',
  '/employer/login',
  '/job-seeker/login',
  // super-admin + children
  '/super-admin',
  '/super-admin/accreditation',
  '/super-admin/job-posts',
  '/super-admin/roles',
  '/super-admin/users',
  '/super-admin/settings',
  '/super-admin/broadcast',
  '/super-admin/reports',
  '/super-admin/logs',
  '/super-admin/notifications',
  '/super-admin/profile',
  // employer + children
  '/employer',
  '/employer/job-posts',
  '/employer/applicants',
  '/employer/employees',
  '/employer/company',
  '/employer/accreditation',
  '/employer/notifications',
  // job-seeker + children
  '/job-seeker',
  '/job-seeker/jobs',
  `/job-seeker/jobs/${publishedJobId}`,
  '/job-seeker/applications',
  '/job-seeker/employment',
  '/job-seeker/profile',
  '/job-seeker/notifications',
]

// One test per route so a failure names the exact route.
for (const path of routes) {
  it(`renders ${path}`, async () => {
    const html = await renderAt(path)
    // Mounted past the Suspense fallback (a lone <LoadingScreen/> leaves "Loading
    // database…" in the DOM and never renders real markup).
    expect(html).not.toContain('Loading database')
    // Produced real markup — an unmounted/crashed container is near-empty.
    // (Kept modest on purpose: some routes legitimately render small states, e.g.
    // the guest-facing /register/employer/status message.)
    expect(html.length).toBeGreaterThan(100)
    // No React error-boundary / dev-error banner leaked into the DOM.
    expect(html).not.toMatch(/Application error|Something went wrong|error-boundary|The above error occurred/i)
  })
}

// --- behavioural assertions: the mock user actually resolved (the real risk) ---

it('job-seeker dashboard resolves the demo seeker (not a blank/guest render)', async () => {
  const html = await renderAt('/job-seeker')
  // full_name prefix of DEMO_USERS['job-seeker'], or the dashboard screen identity.
  expect(/Maria Clarissa|JOB SEEKER DASHBOARD/i.test(html)).toBe(true)
})

it('employer dashboard shows the demo employer company_name', async () => {
  const html = await renderAt('/employer')
  expect(html).toContain('Santa Maria Foods Corporation')
})

it('super-admin dashboard renders its stat labels', async () => {
  const html = await renderAt('/super-admin')
  // Stat label rendered by src/features/super-admin/Dashboard.jsx.
  expect(html).toContain('Job Seekers')
})
