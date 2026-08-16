const logger = require('../../shared/lib/logger');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.lastRun = new Map();
    this.errorCounts = new Map();
    this.maxErrors = 5;
  }

  addJob(name, intervalMs, callback) {
    if (this.jobs.has(name)) {
      this.removeJob(name);
    }

    this.errorCounts.set(name, 0);

    const interval = setInterval(async () => {
      try {
        this.lastRun.set(name, Date.now());
        await callback();
        this.errorCounts.set(name, 0);
      } catch (err) {
        const count = (this.errorCounts.get(name) || 0) + 1;
        this.errorCounts.set(name, count);
        logger.error(`Scheduler job "${name}" error (${count}/${this.maxErrors})`, {
          error: err.message,
          stack: err.stack
        });

        if (count >= this.maxErrors) {
          logger.error(`Scheduler job "${name}" stopped after ${this.maxErrors} consecutive errors`);
          this.removeJob(name);
        }
      }
    }, intervalMs);

    this.jobs.set(name, interval);
    logger.debug(`Scheduler job "${name}" started (interval: ${intervalMs}ms)`);
  }

  removeJob(name) {
    const interval = this.jobs.get(name);
    if (interval) {
      clearInterval(interval);
      this.jobs.delete(name);
      this.errorCounts.delete(name);
      logger.info(`Scheduler job "${name}" stopped`);
    }
  }

  removeAll() {
    for (const [name] of this.jobs) {
      this.removeJob(name);
    }
  }
}

module.exports = new Scheduler();
