import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

import materialRoutes from './routes/material.routes.js';
import publicMaterialRoutes from './routes/material.public.routes.js';

import videoRoutes from './routes/video.routes.js';
import publicVideoRoutes from './routes/video.public.routes.js';
import videoChapterRoutes from './routes/video-chapter.routes.js';

import quizRouter, {
  publicQuizRouter
} from './routes/quiz.routes.js';

import cycleRoutes from './routes/cycle.routes.js';


// ============================================================
// APP
// ============================================================

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === 'production' || isVercel;


// ============================================================
// CORS
// ============================================================

function normalizeOrigin(value) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://frontend-nisabot.vercel.app'
];

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...configuredOrigins
]);


// ============================================================
// RATE LIMIT
// ============================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message: 'Terlalu banyak request. Silakan coba lagi nanti.'
  }
});


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    success: false,
    message: 'Terlalu banyak percobaan autentikasi. Silakan coba lagi nanti.'
  }
});


// ============================================================
// BASIC CONFIGURATION
// ============================================================

app.disable('x-powered-by');

if (isProduction) {
  app.set('trust proxy', 1);
}


// ============================================================
// SECURITY
// ============================================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);


// ============================================================
// CORS MIDDLEWARE
// ============================================================

app.use(
  cors({
    origin(origin, callback) {
      // Request dari server, curl, Postman, dll.
      if (!origin) {
        return callback(null, true);
      }

      // Origin yang sudah diizinkan.
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      // Development: izinkan localhost dengan port apa pun.
      if (
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      const error = new Error(
        `Origin tidak diizinkan: ${origin}`
      );

      error.statusCode = 403;

      return callback(error);
    },

    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin'
    ],

    exposedHeaders: [
      'Content-Length',
      'Content-Type'
    ],

    credentials: false,

    optionsSuccessStatus: 204
  })
);


// ============================================================
// PREFLIGHT
// ============================================================

app.options('*', cors());


// ============================================================
// BODY PARSER
// ============================================================

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb'
  })
);


// ============================================================
// REQUEST LOGGER
// ============================================================

app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[API] ${req.method} ${req.originalUrl}`
    );
  }

  next();
});


// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    environment: isProduction
      ? 'production'
      : 'development',
    timestamp: new Date().toISOString()
  });
});


// ============================================================
// AUTHENTICATION
// ============================================================

app.use(
  '/api/auth',
  apiLimiter,
  authLimiter,
  authRoutes
);


// ============================================================
// ADMIN DASHBOARD
// ============================================================

app.use(
  '/api/admin',
  apiLimiter,
  adminRoutes
);


// ============================================================
// ADMIN MATERIALS
// ============================================================

app.use(
  '/api/admin/materials',
  apiLimiter,
  materialRoutes
);


// ============================================================
// ADMIN VIDEOS
// ============================================================

app.use(
  '/api/admin/videos',
  apiLimiter,
  videoRoutes
);

app.use(
  '/api/admin/videos',
  apiLimiter,
  videoChapterRoutes
);


// ============================================================
// PUBLIC MATERIALS
// ============================================================

app.use(
  '/api/materials',
  apiLimiter,
  publicMaterialRoutes
);


// ============================================================
// PUBLIC VIDEOS
// ============================================================

app.use(
  '/api/videos',
  apiLimiter,
  publicVideoRoutes
);


// ============================================================
// ADMIN QUIZZES
// ============================================================

app.use(
  '/api/admin/quizzes',
  apiLimiter,
  quizRouter
);


// ============================================================
// PUBLIC QUIZZES + QUIZ ATTEMPTS
// ============================================================

app.use(
  '/api/quizzes',
  apiLimiter,
  publicQuizRouter
);


// ============================================================
// MENSTRUAL CYCLE
// ============================================================

app.use(
  '/api/cycles',
  apiLimiter,
  cycleRoutes
);


// ============================================================
// 404 API
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }


  // ----------------------------------------------------------
  // JSON PARSE ERROR
  // ----------------------------------------------------------

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Format JSON request tidak valid.'
    });
  }


  // ----------------------------------------------------------
  // PAYLOAD TOO LARGE
  // ----------------------------------------------------------

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Ukuran request melebihi batas 1 MB.'
    });
  }


  // ----------------------------------------------------------
  // PRISMA UNIQUE CONSTRAINT
  // ----------------------------------------------------------

  if (error?.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'Data bertentangan dengan data yang sudah ada.'
    });
  }


  // ----------------------------------------------------------
  // PRISMA FOREIGN KEY
  // ----------------------------------------------------------

  if (error?.code === 'P2003') {
    return res.status(409).json({
      success: false,
      message: 'Operasi ditolak karena masih memiliki relasi data.'
    });
  }


  // ----------------------------------------------------------
  // PRISMA RECORD NOT FOUND
  // ----------------------------------------------------------

  if (error?.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Data yang diminta tidak ditemukan.'
    });
  }


  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  const candidateStatus =
    Number.isInteger(error?.statusCode)
      ? error.statusCode
      : error?.status;


  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus < 600
      ? candidateStatus
      : 500;


  // ----------------------------------------------------------
  // SERVER LOG
  // ----------------------------------------------------------

  console.error('[API ERROR]', {
    method: req.method,
    path: req.originalUrl,
    status: statusCode,
    name: error?.name,
    message: error?.message,
    code: error?.code,
    stack: error?.stack
  });


  // ----------------------------------------------------------
  // CLIENT MESSAGE
  // ----------------------------------------------------------

  let message = 'Internal server error.';

  if (statusCode < 500) {
    message =
      error?.message ||
      'Request gagal diproses.';
  }


  if (statusCode === 403) {
    message =
      'Origin tidak diizinkan mengakses API.';
  }


  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  return res.status(statusCode).json({
    success: false,
    message
  });
});


// ============================================================
// LOCAL SERVER
// ============================================================

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(
      `Nusa Bot API berjalan di http://localhost:${PORT}`
    );
  });
}


// ============================================================
// VERCEL EXPORT
// ============================================================

export default app;