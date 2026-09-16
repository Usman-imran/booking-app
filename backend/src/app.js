import express from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// CORS_ORIGIN accepts a comma-separated list so the Vite dev server and the
// Capacitor Android WebView (which sends Origin: https://localhost) can both
// be allowed at once. Requests that carry no Origin header at all are not
// subject to CORS and pass through either way.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : '*';

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
