const { Scheduler } = require('../../packages/shared/services/scheduler');
const { registerJobs } = require('../../packages/shared/services/scheduler-jobs');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

(async () => {
    console.log('\nObservable scheduler jobs:\n');
    const scheduler = new Scheduler();
    let runs = 0;
    scheduler.addJob('healthy-job', 60_000, async () => { runs++; });
    check('job metadata is registered', scheduler.listJobs()[0]?.status === 'running');
    const result = await scheduler.runNow('healthy-job');
    const healthy = scheduler.listJobs().find((job) => job.name === 'healthy-job');
    check('approved job can run immediately', result.ok && runs === 1);
    check('duration and run count are recorded', healthy.runCount === 1 && healthy.lastDurationMs >= 0);
    check('pause and resume preserve metadata',
        scheduler.pauseJob('healthy-job') && scheduler.listJobs()[0].status === 'paused'
        && scheduler.resumeJob('healthy-job') && scheduler.listJobs()[0].status === 'running');

    let release;
    scheduler.addJob('slow-job', 60_000, () => new Promise((resolve) => { release = resolve; }));
    const first = scheduler.runNow('slow-job');
    const duplicate = await scheduler.runNow('slow-job');
    check('overlapping execution is refused', duplicate.ok === false && duplicate.reason === 'already-running');
    release();
    await first;

    scheduler.addJob('failing-job', 60_000, async () => { throw new Error('expected failure'); });
    for (let i = 0; i < scheduler.maxErrors; i++) await scheduler.runNow('failing-job');
    const failed = scheduler.listJobs().find((job) => job.name === 'failing-job');
    check('repeated failures stop the job', failed.status === 'stopped' && failed.errorCount === scheduler.maxErrors);
    check('stopped job can be explicitly resumed', scheduler.resumeJob('failing-job') === true);

    const scheduledJobs = new Map();
    let cleanupRuns = 0;
    registerJobs(
        { db: {} },
        { addJob: (name, intervalMs, callback) => scheduledJobs.set(name, callback) },
        { cleanupTrackingMaps: () => { cleanupRuns++; } },
    );
    scheduledJobs.get('map-cleanup')();
    check('shared map-cleanup job calls the injected bot cleanup hook', cleanupRuns === 1);

    scheduler.removeAll();
    check('shutdown removes every job and timer', scheduler.listJobs().length === 0 && scheduler.jobs.size === 0);
    console.log(fails === 0 ? '\nAll scheduler checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
