const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
  constructor() {
    // Resolve against the repo root, not this file's directory. The logger
    // used to sit at the root so __dirname WAS the root; now it lives in
    // lib/, and a bare __dirname would silently start writing to lib/logs/
    // while every tool still reads ./logs.
    this.logDir = path.join(__dirname, '..', '..', 'logs');
    this.generalLogFile = path.join(this.logDir, 'general.log');
    this.errorLogFile = path.join(this.logDir, 'error.log');
    this.maxFileSize = 5 * 1024 * 1024;
    this.maxRotatedFiles = 5;
    this.logLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    this.levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    this.timers = new Map();

    // Hosted log collectors such as Render do not interpret terminal colour
    // sequences and display them literally (for example "\u001b[90m"). Emit
    // ANSI only to an interactive terminal. NO_COLOR/FORCE_COLOR follow the
    // de-facto CLI conventions and make the behaviour explicitly overridable.
    const noColor = Object.prototype.hasOwnProperty.call(process.env, 'NO_COLOR')
      || process.env.TERM === 'dumb';
    const forceColor = process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0';
    this.useColor = Boolean(forceColor || (!noColor && process.stdout.isTTY));

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.generalStream = fs.createWriteStream(this.generalLogFile, { flags: 'a' });
    this.errorStream = fs.createWriteStream(this.errorLogFile, { flags: 'a' });

    this.generalStream.on('error', (err) => console.error('General log stream error:', err));
    this.errorStream.on('error', (err) => console.error('Error log stream error:', err));
  }

  _getTimestamp() {
    return new Date().toISOString();
  }

  _shouldLog(level) {
    return (this.levels[level] ?? 1) >= (this.levels[this.logLevel] ?? 1);
  }

  _formatMessage(level, message, meta = null) {
    const themes = {
      INFO: { color: '\x1b[32m', icon: '✨' },
      WARN: { color: '\x1b[33m', icon: '⚠️' },
      ERROR: { color: '\x1b[31m', icon: '🛑' },
      DEBUG: { color: '\x1b[34m', icon: '🔍' },
      COMMAND: { color: '\x1b[35m', icon: '⚡' },
      PLAYER: { color: '\x1b[36m', icon: '🎶' },
      AUTOMOD: { color: '\x1b[31m', icon: '🛡️' },
      RESET: '\x1b[0m'
    };

    const theme = themes[level] || themes.INFO;
    const timestamp = this._getTimestamp();
    const cleanMsg = message.replace(/\x1b\[[0-9;]*m/g, '');

    let consoleEntry = this.useColor
      ? `\x1b[90m[${timestamp}]\x1b[0m ${theme.icon} ${theme.color}${message}${themes.RESET}`
      : `[${timestamp}] ${theme.icon} ${cleanMsg}`;
    let fileEntry = `[${timestamp}] [${level}] ${cleanMsg}`;

    if (meta) {
      // Better object inspection for console. Colour must follow the same rule
      // as the surrounding entry or util.inspect will reintroduce raw escapes.
      const consoleMeta = typeof meta === 'object'
        ? util.inspect(meta, { colors: this.useColor, depth: 2, compact: true })
        : meta;

      // Plain JSON for files
      const fileMeta = typeof meta === 'object'
        ? JSON.stringify(meta, (k, v) => typeof v === 'bigint' ? v.toString() : v)
        : meta;

      consoleEntry += this.useColor
        ? ` \x1b[90m| ${consoleMeta}\x1b[0m`
        : ` | ${consoleMeta}`;
      fileEntry += ` | ${fileMeta}`;
    }

    return { consoleEntry, fileEntry };
  }

  _rotate(filePath, streamKey) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size < this.maxFileSize) return;

      this[streamKey].end();
      for (let i = this.maxRotatedFiles - 1; i >= 1; i--) {
        const oldFile = `${filePath}.${i}`;
        const newFile = `${filePath}.${i + 1}`;
        if (fs.existsSync(oldFile)) {
          if (i === this.maxRotatedFiles - 1) fs.unlinkSync(oldFile);
          else fs.renameSync(oldFile, newFile);
        }
      }
      fs.renameSync(filePath, `${filePath}.1`);
      this[streamKey] = fs.createWriteStream(filePath, { flags: 'a' });
    } catch (err) {
      console.error('Rotation failed', err);
    }
  }

  /**
   * Neutralise log injection.
   *
   * Usernames, guild names, command arguments and Discord error strings all
   * reach the logger, and every log line is newline-delimited. Without this an
   * attacker can set a username containing a newline and inject a fabricated
   * entry — e.g. forging "[ERROR] ... banned by admin" into general.log, which
   * the dashboard Logs page renders verbatim.
   */
  static _sanitize(value) {
    if (typeof value !== 'string') return value;
    // Strip CR/LF and other C0 control characters, keeping tab.
    return value.replace(/[\r\n]+/g, ' ⏎ ').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
  }

  _log(level, message, meta, type = level) {
    if (!this._shouldLog(level)) return;

    message = Logger._sanitize(message);
    if (meta && typeof meta === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(meta)) clean[k] = Logger._sanitize(v);
      meta = clean;
    }

    const { consoleEntry, fileEntry } = this._formatMessage(type, message, meta);

    if (level === 'ERROR') console.error(consoleEntry);
    else if (level === 'WARN') console.warn(consoleEntry);
    else console.log(consoleEntry);

    this.generalStream.write(fileEntry + '\n');
    if (level === 'ERROR') this.errorStream.write(fileEntry + '\n');

    if (Math.random() < 0.05) { // Increased check frequency for smaller logs
      this._rotate(this.generalLogFile, 'generalStream');
      if (level === 'ERROR') this._rotate(this.errorLogFile, 'errorStream');
    }
  }

  info(m, meta = null) { this._log('INFO', m, meta); }
  warn(m, meta = null) { this._log('WARN', m, meta); }
  error(m, meta = null) { this._log('ERROR', m, meta); }
  debug(m, meta = null) { this._log('DEBUG', m, meta); }

  command(name, user, guild, meta = null) {
    this._log('INFO', `Command /${name} by ${user?.tag || user?.username || user?.id} in ${guild?.name || 'DM'}`, meta, 'COMMAND');
  }

  automod(action, user, guild, details) {
    this._log('INFO', `AutoMod: ${action} for ${user.tag} in ${guild.name}`, details, 'AUTOMOD');
  }

  player(message, meta = null) {
    this._log('INFO', message, meta, 'PLAYER');
  }

  // Performance Timers
  time(label) {
    this.timers.set(label, process.hrtime());
  }

  timeEnd(label) {
    const start = this.timers.get(label);
    if (!start) return;
    const diff = process.hrtime(start);
    const ms = (diff[0] * 1000 + diff[1] / 1000000).toFixed(3);
    this.debug(`Timer [${label}]: ${ms}ms`);
    this.timers.delete(label);
    return ms;
  }
}

module.exports = new Logger();
