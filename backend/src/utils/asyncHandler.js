// Wraps an async route handler so rejected promises are forwarded to
// Express' error-handling middleware instead of being swallowed.
export default function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
