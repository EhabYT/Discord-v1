const fs = require('fs');
const path = require('path');

/**
 * Load every command in a directory tree into the client collection.
 * Duplicate command names are a startup error: silently replacing a command
 * would leave local dispatch and the deployed slash-command definition out of
 * sync.
 */
function loadCommands(commandsPath, commands, logger) {
  if (!fs.existsSync(commandsPath)) return 0;

  let loaded = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!stat.isFile() || !entry.endsWith('.js')) continue;

      let command;
      try {
        command = require(fullPath);
      } catch (err) {
        logger.error(`Load error for ${fullPath}`, { error: err.message });
        continue;
      }
      if (!command?.data || typeof command.execute !== 'function') continue;

      const name = command.data.name;
      if (commands.has(name)) {
        throw new Error(`Duplicate command name "${name}" in ${fullPath}`);
      }
      commands.set(name, command);
      logger.debug(`Loaded command: ${name}`);
      loaded += 1;
    }
  }

  visit(commandsPath);
  return loaded;
}

module.exports = { loadCommands };
