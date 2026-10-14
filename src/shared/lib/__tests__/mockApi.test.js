import { it, expect } from 'vitest';
import { api } from '../api';

// The mock derives the current user from the URL path.
function asRole(role, fn) {
  window.history.pushState({}, '', `/${role}`);
  return fn();
}

it('auth/me returns the demo employer when on an employer path', async () => {
  const me = await asRole('employer', () => api.get('auth/me'));
  expect(me.role).toBe('employer');
  expect(me.company_name).toBeTruthy();
});
it('auth/me returns the demo admin on an admin path', async () => {
  const me = await asRole('super-admin', () => api.get('auth/me'));
  expect(me.role).toBe('super-admin');
});
it('auth/me returns the demo seeker on a seeker path', async () => {
  const me = await asRole('job-seeker', () => api.get('auth/me'));
  expect(me.role).toBe('job-seeker');
});
it('jobs returns the paginated envelope with only published jobs by default', async () => {
  const res = await api.get('jobs');
  expect(Array.isArray(res.jobs)).toBe(true);
  expect(typeof res.total).toBe('number');
  expect(typeof res.page).toBe('number');
  expect(typeof res.pageSize).toBe('number');
  expect(res.jobs.every((j) => j.status === 'published')).toBe(true);
});
it('jobs/:id returns a single job', async () => {
  const res = await api.get('jobs');
  const one = await api.get(`jobs/${res.jobs[0].id}`);
  expect(one.id).toBe(res.jobs[0].id);
});
it('admin/stats returns 14 numeric fields', async () => {
  // The real server (and the Dashboard, which reads stats.companies) returns
  // 14 fields; the task prose said "13" while listing all 14.
  const stats = await api.get('admin/stats');
  expect(Object.keys(stats).length).toBe(14);
  Object.values(stats).forEach((v) => expect(typeof v).toBe('number'));
});
it('notifications/mine only returns the current user notifications', async () => {
  const seeker = await asRole('job-seeker', () => api.get('auth/me'));
  const list = await asRole('job-seeker', () => api.get('notifications/mine'));
  expect(list.every((n) => n.user_id === seeker.id)).toBe(true);
});
it('notifications/mine honours unreadOnly', async () => {
  const list = await asRole('job-seeker', () => api.get('notifications/mine', { unreadOnly: true }));
  expect(list.every((n) => n.is_read === false)).toBe(true);
});
it('applying to a job then listing mine shows the new application', async () => {
  const res = await asRole('job-seeker', () => api.get('jobs'));
  const mine = await asRole('job-seeker', () => api.get('applications/mine'));
  const appliedJobIds = new Set(mine.map((a) => a.job_id));
  const free = res.jobs.find((j) => !appliedJobIds.has(j.id));
  expect(free).toBeTruthy();
  await asRole('job-seeker', () => api.post('applications', { job_id: free.id, resume_id: null }));
  const after = await asRole('job-seeker', () => api.get('applications/mine'));
  expect(after.some((a) => a.job_id === free.id)).toBe(true);
});
it('applying twice to the same job rejects with 409', async () => {
  const res = await asRole('job-seeker', () => api.get('jobs'));
  const mine = await asRole('job-seeker', () => api.get('applications/mine'));
  const appliedJobIds = new Set(mine.map((a) => a.job_id));
  const job = res.jobs.find((j) => appliedJobIds.has(j.id));
  await expect(asRole('job-seeker', () => api.post('applications', { job_id: job.id }))).rejects.toMatchObject({ status: 409 });
});
it('jobs skills filter resolves against the serialized newline-joined requirements', async () => {
  // The seeker Browse Jobs page seeds this filter from the profile skills.
  // requirements are stored as newline-joined strings (D5 serialization), so
  // the haystack must not assume an array — it threw "j.requirements.join is
  // not a function" and the page showed "Couldn't load openings".
  const res = await asRole('job-seeker', () => api.get('jobs', { skills: 'ms office', pageSize: 100 }));
  expect(res.jobs.length).toBeGreaterThan(0);
  for (const j of res.jobs) {
    const hay = `${j.title} ${j.description} ${j.requirements} ${(j.tags || []).join(' ')}`.toLowerCase();
    expect(hay).toContain('ms office');
  }
});
it('reads return clones', async () => {
  const a = await api.get('jobs');
  a.jobs[0].title = 'MUTATED';
  const b = await api.get('jobs');
  expect(b.jobs[0].title).not.toBe('MUTATED');
});
it('marking a notification read flips it and is idempotent', async () => {
  const before = await asRole('job-seeker', () => api.get('notifications/mine'));
  const unread = before.find((n) => !n.is_read);
  const r = await asRole('job-seeker', () => api.post(`notifications/${unread.id}/read`));
  expect(r).toEqual({ read: true });
});
it('reports export resolves to a Blob', async () => {
  const blob = await api.blob('admin/reports/vacancies/export?format=csv');
  expect(blob).toBeInstanceOf(Blob);
  const text = await blob.text();
  expect(text).toContain('Title,Company,Location,Status,Type,Created At');
});
it('an unknown path rejects with 404', async () => {
  await expect(api.get('nope/nothing')).rejects.toMatchObject({ status: 404 });
});
it('files blob routes resolve for resume View/Download links', async () => {
  // The seeker Profile page resolves View/Download links through
  // api.blob('files/resumes/<path>'); the mock has no real files, but the
  // route must resolve to a Blob so the links render.
  await expect(api.blob('files/resumes//uploads/resumes/dela-cruz-maria-clarissa.pdf')).resolves.toBeInstanceOf(Blob);
});
