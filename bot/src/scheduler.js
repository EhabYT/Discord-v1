const logger = require('../../shared/lib/logger');

class Scheduler {
  constructor() {
    this.jobs = new Map();          // name -> interval handle
    this.definitions = new Map();   // name -> { intervalMs, callback }
    this.metadata = new Map();
    this.lastRun = new Map();
    this.errorCounts = new Map();
    this.maxErrors = 5;
  }

  addJob(name, intervalMs, callback) {
    if (this.definitions.has(name)) this.removeJob(name);
    this.definitions.set(name, { intervalMs, callback });
    this.errorCounts.set(name, 0);
    this.metadata.set(name, {
      name, intervalMs, status: 'running', running: false, startedAt: Date.now(),
      nextRunAt: Date.now() + intervalMs, lastRunAt: null, lastDurationMs: null,
      runCount: 0, errorCount: 0, lastError: null,
    });
    this._startInterval(name);
    logger.debug(`Scheduler job "${name}" started (interval: ${intervalMs}ms)`);
  }

  _startInterval(name) {
    const definition = this.definitions.get(name);
    const meta = this.metadata.get(name);
    if (!definition || !meta || this.jobs.has(name)) return false;
    meta.status = 'running';
    meta.nextRunAt = Date.now() + definition.intervalMs;
    const interval = setInterval(() => {
      meta.nextRunAt = Date.now() + definition.intervalMs;
      this.runNow(name).catch(() => {}); // _execute already records/logs the failure
    }, definition.intervalMs);
    interval.unref();
    this.jobs.set(name, interval);
    return true;
  }

  async runNow(name) {
    const definition = this.definitions.get(name);
    const meta = this.metadata.get(name);
    if (!definition || !meta || meta.status === 'stopped') return { ok: false, reason: 'not-found' };
    if (meta.running) return { ok: false, reason: 'already-running' };

    meta.running = true;
    meta.lastRunAt = Date.now();
    this.lastRun.set(name, meta.lastRunAt);
    const started = process.hrtime.bigint();
    try {
      await definition.callback();
      meta.lastDurationMs = Number(process.hrtime.bigint() - started) / 1e6;
      meta.runCount += 1;
      meta.errorCount = 0;
      meta.lastError = null;
      this.errorCounts.set(name, 0);
      return { ok: true, durationMs: meta.lastDurationMs };
    } catch (err) {
      meta.lastDurationMs = Number(process.hrtime.bigint() - started) / 1e6;
      meta.runCount += 1;
      const count = (this.errorCounts.get(name) || 0) + 1;
      this.errorCounts.set(name, count);
      meta.errorCount = count;
      meta.lastError = String(err?.message || err).slice(0, 300);
      logger.error(`Scheduler job "${name}" error (${count}/${this.maxErrors})`, {
        error: err?.message || String(err), stack: err?.stack,
      });
      if (count >= this.maxErrors) {
        this.pauseJob(name, 'stopped');
        logger.error(`Scheduler job "${name}" stopped after ${this.maxErrors} consecutive errors`);
      }
      return { ok: false, reason: 'callback-failed' };
    } finally {
      meta.running = false;
    }
  }

  pauseJob(name, status = 'paused') {
    const interval = this.jobs.get(name);
    if (interval) clearInterval(interval);
    this.jobs.delete(name);
    const meta = this.metadata.get(name);
    if (!meta) return false;
    meta.status = status;
    meta.nextRunAt = null;
    logger.info(`Scheduler job "${name}" ${status}`);
    return true;
  }

  resumeJob(name) {
    const meta = this.metadata.get(name);
    if (!meta || !this.definitions.has(name) || this.jobs.has(name)) return false;
    meta.errorCount = 0;
    meta.lastError = null;
    this.errorCounts.set(name, 0);
    return this._startInterval(name);
  }

  removeJob(name) {
    const interval = this.jobs.get(name);
    if (interval) clearInterval(interval);
    const existed = this.jobs.delete(name) || this.definitions.has(name);
    this.definitions.delete(name);
    this.metadata.delete(name);
    this.errorCounts.delete(name);
    this.lastRun.delete(name);
    if (existed) logger.info(`Scheduler job "${name}" removed`);
    return existed;
  }

  listJobs() {
    return [...this.metadata.values()].map((meta) => ({ ...meta })).sort((a, b) => a.name.localeCompare(b.name));
  }

  removeAll() {
    for (const interval of this.jobs.values()) clearInterval(interval);
    this.jobs.clear();
    this.definitions.clear();
    this.metadata.clear();
    this.errorCounts.clear();
    this.lastRun.clear();
  }
}

module.exports = new Scheduler();
module.exports.Scheduler = Scheduler;
