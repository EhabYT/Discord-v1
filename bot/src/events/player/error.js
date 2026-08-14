const logger = require('../../../../shared/lib/logger');

module.exports = {
    name: 'error',
    execute(queue, error) {
        logger.error('Player error', {
            error: error.message,
            guild: queue && queue.guild ? queue.guild.name : undefined
        });
    }
};
