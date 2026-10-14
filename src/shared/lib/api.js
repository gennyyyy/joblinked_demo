// Frontend-only demo API. Same export shape as the real HTTP client
// (src/shared/lib/api.js) but backed by an in-memory mock store instead of
// fetch — so every service/*.js caller works unchanged and interactive writes
// persist for the session. Reads return deep clones; writes mutate `store`
// and return the affected row(s). See demo_version/SPEC.md "Mock API surface".
import { DEMO_USERS, createStore } from './mockData';

const store = createStore();

// ─── helpers ───────────────────────────────────────────────────────────────
const clone = (value) => structuredClone(value);
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const s = (value) => (value === null || value === undefined ? '' : String(value));
const str = (value) => (value === null || value === undefined ? '' : String(value));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Split a path (no leading 'api/', optional query string) into segments.
const segments = (path) => String(path).split('?')[0].split('/').filter(Boolean);

// Generic comparator that compares numerically when both values parse as
// numbers (string salary/id columns) and falls back to string order (ISO
// timestamps, uuids). Nulls/empties sort last.
function compareVals(x, y) {
  const xEmpty = x === null || x === undefined || x === '';
  const yEmpty = y === null || y === undefined || y === '';
  if (xEmpty && yEmpty) return 0;
  if (xEmpty) return 1;
  if (yEmpty) return -1;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
  return x < y ? -1 : x > y ? 1 : 0;
}
const desc = (key) => (a, b) => compareVals(b[key], a[key]);
const toInt = (value, dflt) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? dflt : n;
};

// Current demo user derives from the first URL segment at call time.
function currentUser() {
  const first = (window.location.pathname || '/').split('/').filter(Boolean)[0];
  if (first === 'employer') return DEMO_USERS.employer;
  if (first === 'super-admin') return DEMO_USERS['super-admin'];
  return DEMO_USERS['job-seeker'];
}

function seekerChildren(kind) {
  if (kind === 'education') return store.education;
  if (kind === 'experience') return store.experience;
  if (kind === 'employment') return store.employmentHistory;
  return null;
}

function findUser(id) {
  let row = store.admins.find((u) => u.id === id);
  if (row) return { row, role: 'super-admin' };
  row = store.employers.find((u) => u.id === id);
  if (row) return { row, role: 'employer' };
  row = store.seekers.find((u) => u.id === id);
  if (row) return { row, role: 'job-seeker' };
  return { row: null, role: null };
}

// ─── jobs listing ────────────────────────────────────────────────────────────
const JOB_ORDER_COLS = ['created_at', 'updated_at', 'salary_min', 'salary_max', 'title', 'deadline', 'published_at'];

function orderJobs(rows, order) {
  const [oc, od] = String(order || 'created_at.desc').split('.');
  const col = JOB_ORDER_COLS.includes(oc) ? oc : 'created_at';
  const dir = od === 'asc' ? 1 : -1;
  const numeric = col === 'salary_min' || col === 'salary_max';
  return rows.slice().sort((a, b) => {
    const c = compareVals(a[col], b[col]);
    // Nulls stay last regardless of direction.
    const aEmpty = a[col] === null || a[col] === undefined || a[col] === '';
    const bEmpty = b[col] === null || b[col] === undefined || b[col] === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (c === 0) return 0;
    return (numeric ? c : c) * dir;
  });
}

function listJobs(params = {}) {
  let rows = store.jobs.slice();
  const status = params.status === undefined || params.status === null ? 'published' : params.status;
  if (status !== 'all') rows = rows.filter((j) => j.status === status);

  const search = str(params.search).trim().toLowerCase();
  if (search) {
    rows = rows.filter((j) => `${j.title || ''} ${j.description || ''} ${j.company_name || ''}`.toLowerCase().includes(search));
  }
  const location = str(params.location).trim().toLowerCase();
  if (location) rows = rows.filter((j) => s(j.location).toLowerCase().includes(location));
  const employmentType = str(params.employmentType).trim();
  if (employmentType) rows = rows.filter((j) => s(j.employment_type).toLowerCase() === employmentType.toLowerCase());
  const workArrangement = str(params.workArrangement).trim();
  if (workArrangement) rows = rows.filter((j) => s(j.work_arrangement).toLowerCase() === workArrangement.toLowerCase());

  const employers = str(params.employer).split(',').map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (employers.length) rows = rows.filter((j) => employers.some((n) => s(j.company_name).toLowerCase().includes(n)));

  const salaryMin = params.salaryMin === null || params.salaryMin === undefined || params.salaryMin === '' ? null : Number(params.salaryMin);
  if (salaryMin !== null && !Number.isNaN(salaryMin)) rows = rows.filter((j) => Number(j.salary_min) >= salaryMin);

  rows = orderJobs(rows, params.order);

  const total = rows.length;
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(100, Math.max(1, toInt(params.pageSize, 10)));
  let pageRows = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // Skills filter is applied AFTER paging so `total` stays the pre-skill count.
  const skills = str(params.skills).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (skills.length) {
    pageRows = pageRows.filter((j) => {
      // requirements is a newline-joined string in the store (D5); s() makes the
      // haystack tolerate that and any legacy array shape.
      const hay = [j.title, j.description, j.requirements, (j.tags || []).join(' ')].map((v) => s(v).toLowerCase()).join(' ');
      return skills.some((term) => hay.includes(term));
    });
  }
  return { jobs: clone(pageRows), total, page, pageSize };
}

function employerJobs(companyId, params = {}) {
  let rows = store.jobs.filter((j) => j.company_id === companyId);
  if (params.status) rows = rows.filter((j) => j.status === params.status);
  return clone(rows
    .slice()
    .sort(desc('created_at'))
    .map((j) => ({ ...j, applicant_count: store.applications.filter((a) => a.job_id === j.id).length })));
}

// ─── admin stats ─────────────────────────────────────────────────────────────
function adminStats() {
  const today = nowIso().slice(0, 10);
  const count = (arr, fn) => arr.filter(fn).length;
  return {
    seekers: store.seekers.length,
    employers: store.employers.length,
    companies: store.employers.length,
    jobs: store.jobs.length,
    applications: store.applications.length,
    pendingAccreditations: count(store.accreditations, (a) => a.status === 'pending'),
    unreadNotifications: count(store.notifications, (n) => n.is_read === false),
    pendingJobs: count(store.jobs, (j) => j.status === 'pending'),
    approvedJobs: count(store.jobs, (j) => j.status === 'approved'),
    closedJobs: count(store.jobs, (j) => j.status === 'closed'),
    expiredJobs: count(store.jobs, (j) => j.deadline < today && j.status !== 'closed' && j.status !== 'archived'),
    acceptedApplicants: count(store.applications, (a) => a.status === 'Accepted'),
    placedApplicants: count(store.applications, (a) => a.status === 'Placed'),
    accreditedEmployers: count(store.employers, (e) => e.accreditation_status === 'approved'),
  };
}

function adminUsers(params = {}) {
  const { role, search, status } = params;
  if (role !== undefined && role !== null && role !== '') {
    if (!['job-seeker', 'employer', 'super-admin'].includes(role)) throw httpError(400, 'Invalid role filter');
  }
  let rows = [
    ...store.seekers.map((u) => ({ ...u, role: 'job-seeker' })),
    ...store.employers.map((u) => ({ ...u, role: 'employer' })),
    ...store.admins.map((u) => ({ ...u, role: 'super-admin' })),
  ];
  if (role) rows = rows.filter((u) => u.role === role);
  const q = str(search).trim().toLowerCase();
  if (q) rows = rows.filter((u) => `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(q));
  if (status) rows = rows.filter((u) => u.status === status);
  return clone(rows.sort(desc('created_at')));
}

function adminAccreditations() {
  return clone(store.accreditations
    .slice()
    .sort(desc('submitted_at'))
    .map((acc) => {
      const company = store.employers.find((e) => e.id === acc.company_id) || null;
      const decider = acc.decided_by ? store.admins.find((a) => a.id === acc.decided_by) : null;
      return { ...acc, employers: company ? clone(company) : null, decided_by: decider ? { full_name: decider.full_name } : null };
    }));
}

function adminAuditLogs(params = {}) {
  const limit = Math.min(2000, Math.max(1, toInt(params.limit, 500)));
  return clone(store.auditLogs.slice().sort(desc('created_at')).slice(0, limit));
}

function companyAccreditations(companyId) {
  return clone(store.accreditations
    .filter((a) => a.company_id === companyId)
    .sort(desc('submitted_at'))
    .map((acc) => {
      const decider = acc.decided_by ? store.admins.find((a) => a.id === acc.decided_by) : null;
      return { ...acc, decided_by: decider ? { full_name: decider.full_name } : null };
    }));
}

function companyDocuments(companyId) {
  return clone(store.documents
    .filter((d) => d.company_id === companyId)
    .sort(desc('uploaded_at'))
    .map((doc) => {
      const reviewer = doc.reviewed_by ? store.admins.find((a) => a.id === doc.reviewed_by) : null;
      const company = store.employers.find((e) => e.id === doc.company_id) || null;
      return {
        ...doc,
        reviewed_by: reviewer ? { full_name: reviewer.full_name } : null,
        company: company ? { id: company.id, company_name: company.company_name } : null,
      };
    }));
}

// ─── report CSV (server-faithful headers) ─────────────────────────────────────
const csvCell = (v) => `"${s(v)}"`;
// Header line left unquoted (matches the fixture); data cells double-quoted so
// values containing commas stay valid CSV.
const reportCsv = (headers, rows) => [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

function buildReport(type) {
  switch (type) {
    case 'applicants':
      return {
        headers: ['Seeker', 'Email', 'Job', 'Company', 'Status', 'Applied At'],
        rows: store.applications.slice().sort(desc('applied_at')).map((a) => [a.seeker?.full_name, a.seeker?.email, a.job?.title, a.job?.employers?.company_name, a.status, a.applied_at]),
      };
    case 'vacancies':
      return {
        headers: ['Title', 'Company', 'Location', 'Status', 'Type', 'Created At'],
        rows: store.jobs.slice().sort(desc('created_at')).map((j) => [j.title, j.employers?.company_name ?? j.company_name, j.location, j.status, j.employment_type, j.created_at]),
      };
    case 'placements':
      return {
        headers: ['Seeker', 'Email', 'Job', 'Company', 'Status', 'Updated At'],
        rows: store.applications.filter((a) => a.status === 'Accepted' || a.status === 'Placed').sort(desc('updated_at')).map((a) => [a.seeker?.full_name, a.seeker?.email, a.job?.title, a.job?.employers?.company_name, a.status, a.updated_at]),
      };
    case 'employers':
      return {
        headers: ['Company', 'Owner', 'Email', 'Status', 'Registered'],
        rows: store.employers.slice().sort(desc('created_at')).map((c) => [c.company_name, c.full_name, c.email, c.status, c.created_at]),
      };
    case 'barangay': {
      const counts = {};
      store.applications
        .filter((a) => (a.status === 'Accepted' || a.status === 'Placed') && a.seeker?.barangay_district)
        .forEach((a) => { counts[a.seeker.barangay_district] = (counts[a.seeker.barangay_district] || 0) + 1; });
      return { headers: ['Barangay', 'Placements'], rows: Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([b, n]) => [b, n]) };
    }
    case 'monthly': {
      const byMonth = {};
      const bump = (value, key) => {
        const m = s(value).slice(0, 7);
        if (!m) return;
        byMonth[m] = { ...byMonth[m], [key]: (byMonth[m]?.[key] || 0) + 1 };
      };
      store.applications.forEach((a) => bump(a.applied_at, 'applications'));
      store.jobs.forEach((j) => bump(j.created_at, 'jobs'));
      store.seekers.forEach((x) => bump(x.created_at, 'seekers'));
      return {
        headers: ['Month', 'Applications', 'Jobs', 'Seekers'],
        rows: Object.keys(byMonth).sort().map((m) => [m, byMonth[m].applications || 0, byMonth[m].jobs || 0, byMonth[m].seekers || 0]),
      };
    }
    default:
      return null;
  }
}

const AI_REPLIES = {
  resume: 'Start with a one-page resume that leads with your strongest skills and any TESDA, on-the-job, or SPES experience — employers in Santa Maria value hands-on training. Use the resume builder in your profile, keep your contact details current, and upload a clean PDF copy. Setting it as your active resume lets you apply to matching jobs in one tap.',
  interview: 'Prepare by re-reading the job post and matching each requirement to a short story from your past work or school projects. Practice answering in Filipino or English, bring your resume, valid IDs, and any certificates, and arrive at least 15 minutes early. Remember, showing willingness to learn often matters more here than years of experience.',
  apply: 'Browse the public job board and open any listing that fits your skills, then click apply and pick your active resume. You can track every application — and its status — from the Applications tab of your job-seeker dashboard. Applying to a few well-matched roles beats sending the same application everywhere.',
  salary: 'Salary ranges on each posting already reflect the local market, and the minimum wage in Bulacan is your baseline floor. Weigh the whole package — SSS, PhilHealth, Pag-IBIG, 13th-month pay, rice subsidy, and allowances — not just the base figure. If a range is close to what you need, apply and negotiate once you have an offer.',
  default: 'You are off to a great start — completing your profile, listing your skills, and uploading a resume will get you matched to more openings. Spend a little time each day reviewing new job posts and applying to the ones that fit you best. Feel free to ask me anything about your resume, interviews, or job applications.',
};

// ─── GET ─────────────────────────────────────────────────────────────────────
function handleGet(path, params = {}) {
  const seg = segments(path);
  const [a, b, c] = seg;

  if (a === 'auth' && b === 'me') return clone(currentUser());

  if (a === 'employers') {
    if (b === 'me') {
      const row = store.employers.find((e) => e.id === currentUser().id);
      if (!row) throw httpError(404, 'Employer profile not found');
      return clone(row);
    }
    if (seg[2] === 'jobs') return employerJobs(b, params);
  }

  if (a === 'seekers' && b === 'me') {
    const row = store.seekers.find((x) => x.id === currentUser().id);
    if (!row) throw httpError(404, 'Seeker profile not found');
    if (c === 'education') return clone(store.education.filter((x) => x.seeker_id === row.id).sort(desc('id')));
    if (c === 'experience') return clone(store.experience.filter((x) => x.seeker_id === row.id).sort(desc('id')));
    if (c === 'employment') return clone(store.employmentHistory.filter((x) => x.seeker_id === row.id).sort(desc('created_at')));
    return clone(row);
  }

  if (a === 'jobs') {
    if (!b) return listJobs(params);
    if (seg[2] === 'history') return [];
    const job = store.jobs.find((j) => j.id === b);
    if (!job) throw httpError(404, 'Job not found');
    return clone(job);
  }

  if (a === 'applications') {
    if (b === 'mine') {
      const id = currentUser().id;
      return clone(store.applications
        .filter((x) => x.seeker_id === id)
        .sort(desc('applied_at'))
        .map((x) => { const copy = { ...x }; delete copy.seeker; return copy; }));
    }
    if (b === 'company' && c) return clone(store.applications.filter((x) => x.job?.company_id === c).sort(desc('applied_at')));
    if (b === 'job' && c) return clone(store.applications.filter((x) => x.job_id === c).sort(desc('applied_at')));
    if (b === 'seekers' && c) {
      const table = seekerChildren(seg[3]);
      if (!table) throw httpError(404, 'Route not found');
      return clone(table.filter((x) => x.seeker_id === c));
    }
    if (seg[2] === 'history') return [];
  }

  if (a === 'notifications' && b === 'mine') {
    const id = currentUser().id;
    let rows = store.notifications.filter((n) => n.user_id === id);
    if (params.unreadOnly) rows = rows.filter((n) => n.is_read === false);
    return clone(rows.sort(desc('created_at')).slice(0, 50));
  }

  if (a === 'files' && b === 'resumes' && c === 'mine') {
    return clone(store.resumes.filter((r) => r.seeker_id === currentUser().id).sort(desc('uploaded_at')));
  }

  if (a === 'documents' && b === 'company' && c) return companyDocuments(c);

  if (a === 'accreditations' && b === 'company' && c) return companyAccreditations(c);

  if (a === 'admin') {
    if (b === 'stats') return adminStats();
    if (b === 'users') return adminUsers(params);
    if (b === 'companies') return clone(store.employers.filter((e) => !params.status || e.status === params.status).sort(desc('created_at')));
    if (b === 'jobs') return clone(store.jobs.filter((j) => !params.status || j.status === params.status).sort(desc('created_at')));
    if (b === 'applications') {
      let rows = store.applications.filter((x) => !params.status || x.status === params.status);
      const q = str(params.search).trim().toLowerCase();
      if (q) rows = rows.filter((x) => s(x.seeker?.full_name).toLowerCase().includes(q));
      return clone(rows.sort(desc('applied_at')));
    }
    if (b === 'employees') return clone(store.applications.filter((x) => x.status === 'Accepted' || x.status === 'Terminated').sort(desc('updated_at')));
    if (b === 'referrals') return clone(store.applications.filter((x) => x.referred_by !== null && x.referred_by !== undefined).sort(desc('applied_at')));
    if (b === 'accreditations') return adminAccreditations();
    if (b === 'audit-logs') return adminAuditLogs(params);
    if (b === 'roles') return clone(store.roles);
    if (b === 'reference' && c) return clone(store.referenceData.filter((r) => r.category === c));
    if (b === 'seekers' && c) {
      const table = seekerChildren(seg[3]);
      if (!table) throw httpError(404, 'Route not found');
      return clone(table.filter((x) => x.seeker_id === c));
    }
  }

  throw httpError(404, 'Route not found');
}

// ─── POST ────────────────────────────────────────────────────────────────────
function handlePost(path, body = {}) {
  const seg = segments(path);
  const [a, b, c] = seg;
  const stamp = nowIso();

  if (a === 'auth' && b === 'provision') return clone(currentUser());

  if (a === 'ai' && b === 'help') {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const text = s(messages[messages.length - 1]?.content).toLowerCase();
    const key = /resume/.test(text) ? 'resume'
      : /interview/.test(text) ? 'interview'
        : /apply|application/.test(text) ? 'apply'
          : /salary|pay\b|wage/.test(text) ? 'salary'
            : 'default';
    return { reply: AI_REPLIES[key] };
  }

  if (a === 'audit') {
    const me = currentUser();
    store.auditLogs.unshift({
      id: uuid(), user_id: me.id, action: body?.action ?? null, entity: body?.entity ?? null,
      entity_id: body?.entity_id ?? null, details: body?.details ?? null, created_at: stamp,
      actor_name: me.full_name, actor_email: me.email,
    });
    return null;
  }

  if (a === 'applications') {
    if (b && seg[2] === 'status') {
      const app = store.applications.find((x) => x.id === b);
      if (!app) throw httpError(404, 'Application not found');
      const { status, remarks = null, employerNotes = null, interviewAt = null, interviewInstructions = null } = body || {};
      app.status = status;
      if (remarks !== null) app.employer_notes = remarks;
      if (employerNotes !== null) app.employer_notes = employerNotes;
      if (interviewAt !== null) app.interview_at = interviewAt;
      if (interviewInstructions !== null) app.interview_instructions = interviewInstructions;
      app.updated_at = stamp;
      return clone(app);
    }
    if (!b) {
      const job = store.jobs.find((j) => j.id === body?.job_id);
      if (!job) throw httpError(404, 'Job not found');
      const seekerId = currentUser().id;
      if (store.applications.some((x) => x.job_id === body.job_id && x.seeker_id === seekerId)) {
        throw httpError(409, 'You have already applied to this job.');
      }
      const me = store.seekers.find((x) => x.id === seekerId);
      const resume = body?.resume_id ? store.resumes.find((r) => r.id === body.resume_id) || null : null;
      const row = {
        id: uuid(), job_id: job.id, seeker_id: seekerId, resume_id: body?.resume_id ?? null,
        status: 'Applied', employer_notes: null, interview_at: null, interview_instructions: null,
        applied_at: stamp, updated_at: stamp, referred_by: null,
        job: { id: job.id, title: job.title, location: job.location, employment_type: job.employment_type, company_id: job.company_id, employers: { id: job.employers?.id, company_name: job.employers?.company_name } },
        seeker: me ? { id: me.id, full_name: me.full_name, email: me.email, phone: me.phone, barangay_district: me.barangay_district, skills: me.skills, employment_status: me.employment_status, preferred_position: me.preferred_position, preferred_location: me.preferred_location } : null,
        resume: resume ? { id: resume.id, file_name: resume.file_name, file_path: resume.file_path } : null,
      };
      store.applications.unshift(row);
      store.notifications.unshift({
        id: uuid(), user_id: job.company_id, type: 'application', title: 'New applicant',
        message: `${me?.full_name || 'A job seeker'} applied for ${job.title}.`, link: '/employer/applicants',
        is_read: false, created_at: stamp,
      });
      return clone({ id: row.id, job_id: row.job_id, seeker_id: row.seeker_id, resume_id: row.resume_id, status: row.status, applied_at: row.applied_at, updated_at: row.updated_at });
    }
  }

  if (a === 'jobs') {
    if (!b) {
      const me = store.employers.find((e) => e.id === currentUser().id) || currentUser();
      const job = {
        id: uuid(), ...body, company_id: currentUser().id,
        company_name: me.company_name, logo_path: me.logo_path ?? null,
        employers: { id: me.id, company_name: me.company_name, logo_path: me.logo_path ?? null },
        status: 'draft', remarks: body?.remarks ?? '', created_at: stamp, updated_at: stamp,
        published_at: null, closed_at: null, archived_at: null,
      };
      store.jobs.unshift(job);
      return clone(job);
    }
    if (seg[2] === 'status') {
      const job = store.jobs.find((j) => j.id === b);
      if (!job) throw httpError(404, 'Job not found');
      job.status = body?.status;
      if (body?.remarks != null) job.remarks = body.remarks;
      const stampKey = { published: 'published_at', closed: 'closed_at', archived: 'archived_at' }[body?.status];
      if (stampKey) job[stampKey] = stamp;
      job.updated_at = stamp;
      return clone(job);
    }
    if (seg[2] === 'duplicate') {
      const job = store.jobs.find((j) => j.id === b);
      if (!job) throw httpError(404, 'Job not found');
      const copy = {
        ...club(clone(job), 'id', 'created_at', 'updated_at', 'published_at', 'closed_at', 'archived_at', 'status', 'remarks'),
        id: uuid(), title: `${job.title} (Copy)`, status: 'draft', remarks: '', deadline: null,
        created_at: stamp, updated_at: stamp, published_at: null, closed_at: null, archived_at: null,
      };
      store.jobs.unshift(copy);
      return clone(copy);
    }
    if (seg[2] === 'publish') {
      const job = store.jobs.find((j) => j.id === b);
      if (!job) throw httpError(404, 'Job not found');
      job.status = 'published'; job.published_at = stamp; job.updated_at = stamp;
      return clone(job);
    }
    if (seg[2] === 'unpublish') {
      const job = store.jobs.find((j) => j.id === b);
      if (!job) throw httpError(404, 'Job not found');
      job.status = 'draft'; job.updated_at = stamp;
      return clone(job);
    }
  }

  if (a === 'accreditations' && !b) {
    const acc = { id: uuid(), company_id: body?.company_id, status: 'pending', remarks: '', decided_by: null, submitted_at: stamp, decided_at: null };
    store.accreditations.unshift(acc);
    return clone(acc);
  }

  if (a === 'documents' && !b) {
    const form = body instanceof FormData ? body : null;
    const file = form?.get('file') || form?.get('documents') || null;
    const companyId = currentUser().id;
    const fileName = file?.name || 'document';
    const doc = {
      id: uuid(), company_id: companyId, accreditation_id: form?.get('accreditation_id') || null,
      doc_type: form?.get('doc_type') || null, file_path: `/uploads/documents/${companyId}/${fileName}`, file_name: fileName,
      status: 'pending', remarks: '', uploaded_at: stamp, reviewed_by: null, reviewed_at: null,
    };
    store.documents.unshift(doc);
    return clone(doc);
  }

  if (a === 'files' && b === 'resumes') {
    if (!c) {
      const form = body instanceof FormData ? body : null;
      const file = form?.get('file') || form?.get('documents') || null;
      const seekerId = currentUser().id;
      const fileName = file?.name || 'resume.pdf';
      const filePath = `/uploads/resumes/${seekerId}/${fileName}`;
      store.resumes.forEach((r) => { if (r.seeker_id === seekerId) r.is_active = false; });
      const resume = { id: uuid(), seeker_id: seekerId, file_path: filePath, file_name: fileName, is_active: true, uploaded_at: stamp };
      store.resumes.unshift(resume);
      return { path: filePath, resume: clone(resume) };
    }
    if (seg[3] === 'activate') {
      const resume = store.resumes.find((r) => r.id === c);
      if (!resume) throw httpError(404, 'Resume not found');
      store.resumes.forEach((r) => { if (r.seeker_id === resume.seeker_id) r.is_active = r.id === resume.id; });
      return clone(store.resumes.find((r) => r.id === c));
    }
  }

  if (a === 'seekers' && b === 'me') {
    const seekerId = currentUser().id;
    if (c === 'education' && !seg[3]) { const entry = { id: uuid(), seeker_id: seekerId, ...body }; store.education.unshift(entry); return clone(entry); }
    if (c === 'experience' && !seg[3]) { const entry = { id: uuid(), seeker_id: seekerId, ...body }; store.experience.unshift(entry); return clone(entry); }
  }

  if (a === 'notifications') {
    if (b === 'read-all') {
      const uid = currentUser().id;
      store.notifications.forEach((n) => { if (n.user_id === uid) n.is_read = true; });
      return { read: true };
    }
    if (b && seg[2] === 'read') {
      const n = store.notifications.find((x) => x.id === b);
      if (n) n.is_read = true;
      return { read: true };
    }
  }

  if (a === 'admin') {
    if (b === 'users') {
      if (c === 'invite') return { invited: true, email: body?.email, role: body?.role };
      if (seg[3] === 'role') return { id: seg[2], role: body?.role };
      if (seg[3] === 'custom-role') {
        const { row, role } = findUser(seg[2]);
        if (!row) throw httpError(404, 'User not found');
        row.custom_role_id = body?.custom_role_id ?? null;
        return clone({ ...row, role });
      }
    }
    if (b === 'roles' && !c) { const role = { id: String(Date.now()), ...body }; store.roles.unshift(role); return clone(role); }
    if (b === 'reference' && c) {
      const sortOrder = Math.max(0, ...store.referenceData.map((r) => r.sort_order || 0)) + 1;
      const entry = { id: String(Date.now()), category: c, value: body?.value, sort_order: sortOrder, details: null };
      store.referenceData.unshift(entry);
      return clone(entry);
    }
    if (b === 'system-notifications') {
      const userIds = [...store.seekers, ...store.employers, ...store.admins].map((u) => u.id);
      userIds.forEach((userId) => store.notifications.unshift({
        id: uuid(), user_id: userId, type: 'system', title: body?.title, message: body?.message,
        link: body?.link ?? null, is_read: false, created_at: stamp,
      }));
      return { sent: userIds.length };
    }
    if (b === 'jobs' && seg[3] === 'publish') {
      const job = store.jobs.find((j) => j.id === c);
      if (!job) throw httpError(404, 'Job not found');
      job.status = 'published'; job.published_at = stamp; job.updated_at = stamp;
      return clone(job);
    }
    if (b === 'jobs' && seg[3] === 'unpublish') {
      const job = store.jobs.find((j) => j.id === c);
      if (!job) throw httpError(404, 'Job not found');
      job.status = 'draft'; job.updated_at = stamp;
      return clone(job);
    }
  }

  throw httpError(404, 'Route not found');
}

// Returns a shallow copy of `obj` without the given keys.
function club(obj, ...keys) {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k)));
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
function handlePatch(path, body = {}) {
  const seg = segments(path);
  const [a, b, c] = seg;
  const stamp = nowIso();

  if (a === 'employers' && b === 'me') {
    const row = store.employers.find((e) => e.id === currentUser().id);
    if (!row) throw httpError(404, 'Employer profile not found');
    Object.assign(row, body); row.updated_at = stamp;
    return clone(row);
  }
  if (a === 'seekers' && b === 'me') {
    const row = store.seekers.find((x) => x.id === currentUser().id);
    if (!row) throw httpError(404, 'Seeker profile not found');
    Object.assign(row, body); row.updated_at = stamp;
    return clone(row);
  }
  if (a === 'jobs' && b) {
    const job = store.jobs.find((j) => j.id === b);
    if (!job) throw httpError(404, 'Job not found');
    Object.assign(job, body); job.updated_at = stamp;
    return clone(job);
  }
  if (a === 'admin' && b === 'jobs' && c) {
    const job = store.jobs.find((j) => j.id === c);
    if (!job) throw httpError(404, 'Job not found');
    Object.assign(job, body); job.updated_at = stamp;
    return clone(club(job, 'employers'));
  }
  if (a === 'admin' && b === 'users' && c) {
    const { row } = findUser(c);
    if (!row) throw httpError(404, 'User not found');
    Object.assign(row, body); row.updated_at = stamp;
    return clone(row);
  }
  if (a === 'admin' && b === 'roles' && c) {
    const role = store.roles.find((r) => r.id === c);
    if (!role) throw httpError(404, 'Role not found');
    Object.assign(role, body);
    return clone(role);
  }
  if (a === 'accreditations' && b) {
    const acc = store.accreditations.find((x) => x.id === b);
    if (!acc) throw httpError(404, 'Accreditation not found');
    const decider = currentUser().id;
    const terminal = ['approved', 'rejected', 'revoked'].includes(body?.status);
    acc.status = body?.status; acc.remarks = body?.remarks ?? acc.remarks; acc.decided_by = decider;
    if (terminal) acc.decided_at = stamp;
    return clone(acc);
  }
  if (a === 'documents' && b) {
    const doc = store.documents.find((x) => x.id === b);
    if (!doc) throw httpError(404, 'Document not found');
    doc.status = body?.status; doc.remarks = body?.remarks ?? doc.remarks; doc.reviewed_by = currentUser().id; doc.reviewed_at = stamp;
    return clone(doc);
  }

  throw httpError(404, 'Route not found');
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
function handleDelete(path) {
  const seg = segments(path);
  const [a, b, c] = seg;
  const removeFrom = (table, id) => {
    const idx = table.findIndex((r) => r.id === id);
    if (idx === -1) throw httpError(404, 'Not found');
    table.splice(idx, 1);
    return { deleted: true };
  };

  if (a === 'jobs' && b) {
    const idx = store.jobs.findIndex((j) => j.id === b);
    if (idx === -1) throw httpError(404, 'Job not found');
    const applications = store.applications.filter((x) => x.job_id === b).length;
    store.jobs.splice(idx, 1);
    store.applications = store.applications.filter((x) => x.job_id !== b);
    return { deleted: true, applications };
  }
  if (a === 'documents' && b) return removeFrom(store.documents, b);
  if (a === 'files' && b === 'resumes' && c) return removeFrom(store.resumes, c);
  if (a === 'notifications' && b) return removeFrom(store.notifications, b);
  if (a === 'admin' && b === 'roles' && c) return removeFrom(store.roles, c);
  if (a === 'admin' && b === 'reference' && c) return removeFrom(store.referenceData, c);
  if (a === 'seekers' && b === 'me' && seg[3]) {
    const table = seg[2] === 'education' ? store.education : seg[2] === 'experience' ? store.experience : null;
    if (!table) throw httpError(404, 'Route not found');
    return removeFrom(table, seg[3]);
  }

  throw httpError(404, 'Route not found');
}

// ─── blob ────────────────────────────────────────────────────────────────────
function handleBlob(path) {
  const seg = segments(path);
  // Demo has no real files; View/Download links just need a resolvable blob.
  if (seg[0] === 'files' && seg[1]) {
    const content = `JobLinked demo — this is a placeholder for ${path}.`;
    const blob = new Blob([content], { type: 'text/plain' });
    if (typeof blob.text !== 'function') blob.text = () => Promise.resolve(content);
    return blob;
  }
  if (seg[0] === 'admin' && seg[1] === 'reports' && seg[3] === 'export') {
    let type = seg[2];
    if (type === 'applications') type = 'applicants';
    if (type === 'jobs') type = 'vacancies';
    const report = buildReport(type);
    if (!report) throw httpError(400, `Unknown report type: ${seg[2]}`);
    const csv = reportCsv(report.headers, report.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    // jsdom's Blob (test runner) predates .text(); real browsers ship it. Shim
    // so blob.text() resolves everywhere — a no-op where .text already exists.
    if (typeof blob.text !== 'function') blob.text = () => Promise.resolve(csv);
    return blob;
  }
  throw httpError(404, 'Route not found');
}

export const api = {
  get: (path, params) => Promise.resolve().then(() => handleGet(path, params)),
  post: (path, body) => Promise.resolve().then(() => handlePost(path, body)),
  patch: (path, body) => Promise.resolve().then(() => handlePatch(path, body)),
  del: (path) => Promise.resolve().then(() => handleDelete(path)),
  blob: (path) => Promise.resolve().then(() => handleBlob(path)),
};
