import ApiError from '../utils/ApiError.js';

// Centralized error handler. Route handlers (wrapped with asyncHandler)
// can simply `throw new ApiError(status, message)` and this formats a
// consistent JSON response. Keep this the single place responses get shaped.
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  // express.json() reports malformed request bodies as a generic
  // SyntaxError; surface that as a normal 400 instead of a masked 500.
  if (!(err instanceof ApiError) && err.type === 'entity.parse.failed') {
    err = new ApiError(400, 'Invalid JSON in request body.');
  }

  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;

  // Only ApiError messages are intentionally written for API consumers.
  // Anything else is an unexpected/programming error: log it, but never
  // leak its message/stack to the client.
  if (!isApiError) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      status: statusCode,
      message: isApiError ? err.message : 'Internal server error',
      ...(isApiError && err.details ? { details: err.details } : {}),
    },
  });
}
