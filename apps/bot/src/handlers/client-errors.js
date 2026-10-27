function attachClientErrorHandler(client, logger) {
  const handler = (error) => {
    logger.error('Discord client error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  };
  client.on('error', handler);
  return () => client.removeListener('error', handler);
}

module.exports = { attachClientErrorHandler };
