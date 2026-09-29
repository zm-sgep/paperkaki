/** A logger that drops everything, for seeds that would otherwise warn about unverified fixtures. */
export const silentLogger = { warn: () => undefined };
