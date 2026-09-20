import express from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// CORS_ORIGIN is a comma-separated list of allowed origins, e.g.
//   CORS_ORIGIN=http://localhost:8081,https://app.example.com
// Unset means allow everything. Only browsers send an Origin header - the
// native mobile app never does and is never blocked by this - so it matters
// for the app's web build (`npx expo start --web`). Outside production, any
// localhost / 127.0.0.1 origin is also accepted regardless of port, so the
// web build keeps working when Metro picks another port, or when it is
// opened via 127.0.0.1 instead of localhost — both of which otherwise fail
// in the browser as an opaque "Failed to fetch".
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function isOriginAllowed(origin) {
  // No Origin header: same-origin, curl, server-to-server — nothing to block.
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && LOCAL_ORIGIN_RE.test(origin)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        // Logged so a blocked origin is visible in the server console
        // instead of only as a silent browser-side failure.
        console.warn(`CORS: blocked request from origin ${origin}`);
        callback(null, false);
      }
    },
  })
);
app.use(express.json());

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
