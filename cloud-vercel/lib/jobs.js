import { randomUUID } from 'crypto';
import { createJobDb, getJobDb, updateJobDb, listRecentJobsDb, isSupabaseConfigured } from './db.js';

// In-memory fallback when Supabase is not configured. Vercel serverless
// functions are stateless, so this is only useful for single-instance previews.
const JOBS = new Map();
const LOCKS = new Map();
const MAX_JOBS = 200;
const TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

async function withLock(jobId, fn) {
  while (LOCKS.get(jobId)) {
    await LOCKS.get(jobId);
  }
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  LOCKS.set(jobId, promise);
  try {
    return await fn();
  } finally {
    LOCKS.delete(jobId);
    release();
  }
}

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

function serializeJob(job) {
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

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    commandKey: row.command_key,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    total: row.total,
    pending: row.pending,
    success: row.success,
    failed: row.failed,
    noResponse: row.no_response,
    stores: Array.isArray(row.stores) ? row.stores : [],
  };
}

export async function createJob(storeIds, commandKey) {
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

  if (isSupabaseConfigured()) {
    try {
      await createJobDb(serializeJob(job));
    } catch (e) {
      // Fall back to memory if DB write fails so callers still get a jobId.
      JOBS.set(job.id, job);
    }
  } else {
    JOBS.set(job.id, job);
  }
  return job;
}

export async function getJob(jobId) {
  cleanup();

  if (isSupabaseConfigured()) {
    try {
      const row = await getJobDb(jobId);
      const job = rowToJob(row);
      return job ? summarizeJob(job) : null;
    } catch (e) {
      // Fall back to memory if DB read fails.
    }
  }

  const job = JOBS.get(jobId);
  if (!job) return null;
  return summarizeJob(job);
}

export async function listRecentJobs(limit = 20) {
  cleanup();

  if (isSupabaseConfigured()) {
    try {
      const rows = await listRecentJobsDb(limit);
      return rows.map(rowToJob).filter(Boolean).map(summarizeJob);
    } catch (e) {
      // Fall back to memory if DB read fails.
    }
  }

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

export async function updateStoreResult(jobId, storeId, status, result, error) {
  return withLock(jobId, async () => {
    let job = null;

    if (isSupabaseConfigured()) {
      try {
        const row = await getJobDb(jobId);
        job = rowToJob(row);
      } catch (e) {
        job = JOBS.get(jobId);
      }
    } else {
      job = JOBS.get(jobId);
    }

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

    if (isSupabaseConfigured()) {
      try {
        await updateJobDb(serializeJob(job));
      } catch (e) {
        // Keep memory copy as fallback.
        JOBS.set(job.id, job);
      }
    } else {
      JOBS.set(job.id, job);
    }
  });
}
