import { it, expect } from 'vitest';
import { DEMO_USERS, createStore } from '../mockData';

it('demo users are the first row of their table', () => {
  const s = createStore();
  expect(DEMO_USERS.employer.id).toBe(s.employers[0].id);
  expect(DEMO_USERS['job-seeker'].id).toBe(s.seekers[0].id);
  expect(DEMO_USERS['super-admin'].id).toBe(s.admins[0].id);
});

it('every application joins resolve', () => {
  const s = createStore();
  const seekerIds = new Set(s.seekers.map((x) => x.id));
  const jobIds = new Set(s.jobs.map((x) => x.id));
  s.applications.forEach((a) => {
    expect(seekerIds.has(a.seeker_id)).toBe(true);
    expect(jobIds.has(a.job_id)).toBe(true);
  });
});

it('every job joins to an employer', () => {
  const s = createStore();
  const employerIds = new Set(s.employers.map((x) => x.id));
  s.jobs.forEach((j) => expect(employerIds.has(j.company_id)).toBe(true));
});

it('the demo employer has applicants and the demo seeker has applications', () => {
  const s = createStore();
  const employerJobIds = new Set(s.jobs.filter((j) => j.company_id === DEMO_USERS.employer.id).map((j) => j.id));
  const employerApps = s.applications.filter((a) => employerJobIds.has(a.job_id));
  expect(employerApps.length).toBeGreaterThanOrEqual(6);
  expect(s.applications.filter((a) => a.seeker_id === DEMO_USERS['job-seeker'].id).length).toBeGreaterThanOrEqual(4);
});

it('covers all statuses with enough published jobs', () => {
  const s = createStore();
  const jobStatuses = new Set(s.jobs.map((j) => j.status));
  expect(s.jobs.filter((j) => j.status === 'published').length).toBeGreaterThanOrEqual(5);
  ['draft', 'pending', 'approved', 'rejected', 'published', 'closed', 'archived'].forEach((st) =>
    expect(jobStatuses.has(st)).toBe(true),
  );
  const appStatuses = new Set(s.applications.map((a) => a.status));
  ['Applied', 'Under Review', 'Interview', 'Accepted', 'Rejected', 'Placed', 'Terminated'].forEach((st) =>
    expect(appStatuses.has(st)).toBe(true),
  );
});

it('salary is a string and notification ids are strings with unread rows', () => {
  const s = createStore();
  const job = s.jobs.find((j) => j.status === 'published');
  expect(typeof job.salary_min).toBe('string');
  expect(s.notifications.filter((n) => !n.is_read).length).toBeGreaterThanOrEqual(5);
  s.notifications.forEach((n) => expect(typeof n.id).toBe('string'));
});
