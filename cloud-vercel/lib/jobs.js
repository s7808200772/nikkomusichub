import { randomUUID } from 'crypto';

// In-memory job queue with TTL. Vercel serverless functions are stateless,
// so this is a best-effort cache. For heavy multi-store deployments, switch
// to Redis/Vercel KV.
const JOBS = new Map();
const MAX_JOBS = 200;
const TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function now() {
  return Date.now();
}

function cleanup() {
  const cutoff = now() - TTL_MS;
  for (const [id, job] of JOBS.entries()) {
    if (job.createdAt < cutoff) JOBS.delete(id);
  }
  if (JOBS.size > MAX_JOBS) {
    const sorted = [...JOBS.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    sorted.slice(0, sorted.length - MAX_JOBS).forEach(([id]) => JOBS.delete(id));
  }
}

export function createJob(storeIds, commandKey) {
  cleanup();
  const job = {
    id: randomUUID(),
    commandKey,
    createdAt: now(),
    updatedAt: now(),
    total: storeIds.length,
    pending: storeIds.length,
    success: 0,
    failed: 0,
    noResponse: 0,
    stores: storeIds.map((storeId) => ({
      storeId,
      status: 'pending',
      attempts: 0,
      result: null,
      error: null,
      finishedAt: null,
    })),
  };
  JOBS.set(job.id, job);
  return job;
}

export function getJob(jobId) {
  cleanup();
  const job = JOBS.get(jobId);
  if (!job) return null;
  return summarizeJob(job);
}

export function listRecentJobs(limit = 20) {
  cleanup();
  return [...JOBS.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(summarizeJob);
}

function summarizeJob(job) {
  return {
    id: job.id,
    commandKey: job.commandKey,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    total: job.total,
    pending: job.pending,
    success: job.success,
    failed: job.failed,
    noResponse: job.noResponse,
    stores: job.stores,
  };
}

export function updateStoreResult(jobId, storeId, status, result, error) {
  const job = JOBS.get(jobId);
  if (!job) return;
  const entry = job.stores.find((s) => s.storeId === storeId);
  if (!entry) return;

  // Only move counters if previous status was terminal; otherwise decrement pending.
  if (entry.status === 'pending') {
    job.pending = Math.max(0, job.pending - 1);
  } else if (entry.status === 'success') {
    job.success = Math.max(0, job.success - 1);
  } else if (entry.status === 'failed') {
    job.failed = Math.max(0, job.failed - 1);
  } else if (entry.status === 'no_response') {
    job.noResponse = Math.max(0, job.noResponse - 1);
  }

  entry.status = status;
  entry.attempts += 1;
  entry.result = result;
  entry.error = error;
  entry.finishedAt = now();

  if (status === 'success') job.success += 1;
  else if (status === 'failed') job.failed += 1;
  else if (status === 'no_response') job.noResponse += 1;
  else job.pending += 1;

  job.updatedAt = now();
}
