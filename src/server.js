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

const app = express();

const PORT = Number(process.env.PORT) || 5000;

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);


// ============================================================
// ENVIRONMENT
// ============================================================

function normalizeOrigin(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const defaultProductionOrigins = [
  'https://frontend-nisabot.vercel.app'
];

const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const allowedOrigins = new Set([
  ...defaultProductionOrigins,
  ...developmentOrigins,
  ...configuredOrigins
]);


// ============================================================
// CORS LOG
// ============================================================

console.log(
  '[CORS] Allowed origins:',
  [...allowedOrigins]
);


// ============================================================
// RATE LIMITER
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
    message: 'Terlalu banyak percobaan autentikasi. Silakan login kembali nanti.'
  }
});


// ============================================================
// APP CONFIG
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
    crossOriginResourcePolicy: false
  })
);


// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin(origin, callback) {
      // Request dari server, curl, Postman, dan health check
      // biasanya tidak mempunyai Origin.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn(
        `[CORS] Origin ditolak: ${origin}`
      );

      const error = new Error(
        'Origin not allowed by CORS'
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
      'Accept'
    ],

    exposedHeaders: [
      'Content-Length'
    ],

    credentials: false,

    optionsSuccessStatus: 204
  })
);


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
// HEALTH CHECK
// ============================================================

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    timestamp: new Date().toISOString(),
    environment: isProduction
      ? 'production'
      : 'development'
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
// ADMIN MATERIAL
// ============================================================

app.use(
  '/api/admin/materials',
  apiLimiter,
  materialRoutes
);


// ============================================================
// ADMIN VIDEO
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
// PUBLIC MATERIAL
// ============================================================

app.use(
  '/api/materials',
  apiLimiter,
  publicMaterialRoutes
);


// ============================================================
// PUBLIC VIDEO
// ============================================================

app.use(
  '/api/videos',
  apiLimiter,
  publicVideoRoutes
);


// ============================================================
// ADMIN QUIZ
//
// Prefix:
// /api/admin/quizzes
//
// Semua route admin quiz sudah menggunakan:
//
// requireAuth
// requireRole('ADMIN')
//
// di dalam quiz.routes.js
// ============================================================

app.use(
  '/api/admin/quizzes',
  apiLimiter,
  quizRouter
);


// ============================================================
// PUBLIC QUIZ
//
// Prefix:
// /api/quizzes
//
// GET /api/quizzes
// GET /api/quizzes/:quizId
//
// Public.
//
// Attempt:
//
// POST /api/quizzes/:quizId/attempts
// POST /api/quizzes/attempts/:attemptId/answers
// POST /api/quizzes/attempts/:attemptId/complete
//
// membutuhkan requireAuth yang didefinisikan
// di quiz.routes.js.
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
// API NOT FOUND
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path,
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
  // REQUEST TOO LARGE
  // ----------------------------------------------------------

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Ukuran request melebihi batas 1 MB.'
    });
  }


  // ----------------------------------------------------------
  // CORS ERROR
  // ----------------------------------------------------------

  if (
    error?.message === 'Origin not allowed by CORS' ||
    error?.statusCode === 403
  ) {
    return res.status(403).json({
      success: false,
      message: 'Origin tidak diizinkan mengakses API.'
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
  // CUSTOM STATUS
  // ----------------------------------------------------------

  const candidateStatus =
    Number.isInteger(error?.statusCode)
      ? error.statusCode
      : error?.status;


  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus < 500
      ? candidateStatus
      : 500;


  // ----------------------------------------------------------
  // SERVER ERROR LOG
  // ----------------------------------------------------------

  if (statusCode >= 500) {
    console.error(
      'Unhandled server error:',
      {
        method: req.method,
        path: req.path,
        name: error?.name,
        message: error?.message,
        code: error?.code,
        meta: error?.meta,
        stack: error?.stack
      }
    );
  }


  // ----------------------------------------------------------
  // RESPONSE MESSAGE
  // ----------------------------------------------------------

  const message =
    statusCode >= 500
      ? 'Internal server error'
      : error?.message ||
        'Request gagal diproses.';


  return res.status(statusCode).json({
    success: false,
    message
  });
});


// ============================================================
// LOCAL SERVER
// ============================================================

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(
      `Nusa Bot API berjalan di http://localhost:${PORT}`
    );
  });
}


// ============================================================
// VERCEL
// ============================================================

export default app;