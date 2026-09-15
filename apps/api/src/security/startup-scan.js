/**
 * Startup Security Scanner
 *
 * Runs security checks on application startup to identify potential
 * misconfigurations or vulnerabilities before the server accepts traffic.
 */

const fs = require('fs');
const path = require('path');
const logger = require('eb-bot-shared/lib/logger');

const WARNINGS = [];

function warn(msg) { WARNINGS.push(msg); logger.warn(`[Security Scan] ${msg}`); }
function info(msg) { logger.info(`[Security Scan] ${msg}`); }

/**
 * Check required environment variables
 */
function checkEnvironment() {
    info('Checking environment variables...');

    const required = ['SESSION_SECRET', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET'];
    const recommended = ['DATABASE_URL', 'WEBHOOK_SECRET', 'IP_ALLOWLIST'];

    for (const env of required) {
        if (!process.env[env]) {
            warn(`Missing required env: ${env}`);
        }
    }

    for (const env of recommended) {
        if (!process.env[env]) {
            info(`Missing recommended env: ${env}`);
        }
    }

    if (process.env.DASHBOARD_AUTH === 'false') {
        warn('DASHBOARD_AUTH=false — anonymous access enabled (loopback only)');
    }

    if (process.env.NODE_ENV !== 'production') {
        info('Running in non-production mode');
    }
}

/**
 * Check file permissions on sensitive files
 */
function checkFilePermissions() {
    info('Checking file permissions...');

    const sensitiveFiles = [
        '.env',
        'backups/',
        'data/',
    ];

    for (const file of sensitiveFiles) {
        const fullPath = path.join(process.cwd(), file);
        try {
            if (fs.existsSync(fullPath)) {
                const stat = fs.statSync(fullPath);
                const mode = (stat.mode & 0o777).toString(8);

                if (file.endsWith('/')) {
                    if (mode !== '700' && mode !== '750') {
                        warn(`${file} permissions too open: ${mode} (recommend 700)`);
                    }
                } else {
                    if (mode !== '600' && mode !== '640') {
                        warn(`${file} permissions too open: ${mode} (recommend 600)`);
                    }
                }
            }
        } catch {
            // File doesn't exist or can't be checked
        }
    }
}

/**
 * Check for common security issues in dependencies
 */
function checkDependencies() {
    info('Checking dependencies...');

    try {
        const packagePath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const riskyPackages = [
                'eval',
                'child_process',
                'shelljs',
                'request',
            ];

            for (const p of riskyPackages) {
                if (deps[p]) {
                    warn(`Potentially risky dependency: ${p}`);
                }
            }
        }
    } catch {
        // Can't check dependencies
    }
}

/**
 * Check for exposed debug/test endpoints
 */
function checkDebugEndpoints() {
    info('Checking for debug endpoints...');

    if (process.env.NODE_ENV === 'production') {
        if (process.env.DASHBOARD_DEBUG === 'true') {
            warn('DASHBOARD_DEBUG=true in production');
        }
    }
}

/**
 * Run all security checks
 */
function runSecurityScan() {
    info('Starting security scan...');

    checkEnvironment();
    checkFilePermissions();
    checkDependencies();
    checkDebugEndpoints();

    const summary = {
        warnings: WARNINGS.length,
        timestamp: new Date().toISOString(),
    };

    if (WARNINGS.length > 0) {
        logger.warn(`Security scan completed with ${WARNINGS.length} warnings`, summary);
    } else {
        info('Security scan completed — no issues found');
    }

    return summary;
}

/**
 * Get scan results
 */
function getResults() {
    return {
        warnings: WARNINGS,
        timestamp: new Date().toISOString(),
    };
}

module.exports = {
    runSecurityScan,
    getResults,
};
