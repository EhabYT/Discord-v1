const logger = require('../../utils_logger');

module.exports = {
    name: 'error',
    async execute(queue, error) {
        logger.error('Player error', {
            error: error.message,
            guild: queue && queue.guild ? queue.guild.name : undefined
        });
    }
};
