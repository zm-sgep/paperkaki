import type { Instrumentation } from "next";

/**
 * Logs server errors as structured lines carrying the request ID and the error digest, so
 * the reference shown on the error screen can be matched to the log.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { logger } = await import("@/lib/logger");
  const rawId = request.headers["x-request-id"];
  const requestId = Array.isArray(rawId) ? rawId[0] : rawId;
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;

  logger.error(
    {
      requestId,
      digest,
      err: error,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    },
    "Unhandled server error",
  );
};
