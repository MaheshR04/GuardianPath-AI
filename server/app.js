import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(helmet());

// Express 5 compatible mongo sanitization
app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body);
  }
  if (req.params) {
    req.params = mongoSanitize.sanitize(req.params);
  }
  if (req.query) {
    const cleanQuery = mongoSanitize.sanitize(JSON.parse(JSON.stringify(req.query)));
    Object.defineProperty(req, 'query', {
      value: cleanQuery,
      writable: true,
      configurable: true,
    });
  }
  next();
});

app.use('/api', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));



if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
