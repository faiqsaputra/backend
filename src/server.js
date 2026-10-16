import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import materialRoutes from './routes/material.routes.js';
import videoRoutes from './routes/video.routes.js';
import publicMaterialRoutes from './routes/material.public.routes.js';
import publicVideoRoutes from './routes/video.public.routes.js';
import videoChapterRoutes from './routes/video-chapter.routes.js';
import quizRouter, { publicQuizRouter } from './routes/quiz.routes.js';
import cycleRoutes from './routes/cycle.routes.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

/* =========================================================
   ENVIRONMENT
========================================================= */

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);

/* =========================================================
   CORS
========================================================= */

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

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
  ...(isProduction
    ? defaultProductionOrigins
    : developmentOrigins),

  ...configuredOrigins
]);

console.log(
  '[CORS] Allowed origins:',
  [...allowedOrigins]
);

if (isProduction && configuredOrigins.length === 0) {
  console.warn(
    '[CORS] CORS_ORIGINS belum dikonfigurasi. ' +
    'Menggunakan default production origin.'
  );
}

/* =========================================================
   CORS MIDDLEWARE
========================================================= */

const corsOptions = {
  origin(origin, callback) {
    /*
     * Request dari:
     * - curl
     * - Postman
     * - server-to-server
     *
     * biasanya tidak memiliki Origin.
     */
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    console.warn(
      `[CORS] Origin ditolak: ${origin}`
    );

    /*
     * Jangan throw error 403 dari middleware CORS.
     *
     * Biarkan request diproses tanpa CORS header.
     * Browser yang akan menolak akses JavaScript
     * terhadap response tersebut.
     */
    return callback(null, false);
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
    'Authorization'
  ],

  credentials: true,

  optionsSuccessStatus: 204,

  maxAge: 86400
};

/*
 * CORS harus dipasang sebelum seluruh route API.
 */
app.use(cors(corsOptions));

/*
 * Explicit preflight handler.
 *
 * Membantu request POST/PUT/PATCH/DELETE
 * yang menggunakan Authorization atau Content-Type.
 */
app.options('*', cors(corsOptions));

/* =========================================================
   SECURITY
========================================================= */

app.disable('x-powered-by');

app.use(
  helmet()
);

if (isProduction) {
  app.set('trust proxy', 1);
}

/* =========================================================
   BODY PARSER
========================================================= */

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

/* =========================================================
   RATE LIMIT
========================================================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 120,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Terlalu banyak request. Silakan coba lagi nanti.'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 30,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  message: {
    success: false,
    message:
      'Terlalu banyak percobaan autentikasi. Silakan coba lagi nanti.'
  }
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
   AUTHENTICATION
========================================================= */

app.use(
  '/api/auth',
  apiLimiter,
  authLimiter,
  authRoutes
);

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

app.use(
  '/api/admin',
  apiLimiter,
  adminRoutes
);

/* =========================================================
   ADMIN CONTENT MANAGEMENT
========================================================= */

app.use(
  '/api/admin/materials',
  apiLimiter,
  materialRoutes
);

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

/* =========================================================
   PUBLIC CONTENT
========================================================= */

app.use(
  '/api/materials',
  apiLimiter,
  publicMaterialRoutes
);

app.use(
  '/api/videos',
  apiLimiter,
  publicVideoRoutes
);

/* =========================================================
   QUIZ
========================================================= */

/*
 * Admin quiz
 */
app.use(
  '/api/admin/quizzes',
  apiLimiter,
  quizRouter
);

/*
 * Public quiz
 */
app.use(
  '/api/quizzes',
  apiLimiter,
  publicQuizRouter
);

/* =========================================================
   MENSTRUAL CYCLE
========================================================= */

app.use(
  '/api/cycles',
  apiLimiter,
  cycleRoutes
);

/* =========================================================
   API NOT FOUND
========================================================= */

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  /* -------------------------------------------------------
     JSON PARSING ERROR
  ------------------------------------------------------- */

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message:
        'Format JSON request tidak valid.'
    });
  }

  /* -------------------------------------------------------
     PAYLOAD TOO LARGE
  ------------------------------------------------------- */

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message:
        'Ukuran request melebihi batas 1 MB.'
    });
  }

  /* -------------------------------------------------------
     PRISMA ERRORS
  ------------------------------------------------------- */

  if (error.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message:
        'Data bertentangan dengan data yang sudah ada.'
    });
  }

  if (error.code === 'P2003') {
    return res.status(409).json({
      success: false,
      message:
        'Operasi ditolak karena masih memiliki relasi data.'
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message:
        'Data yang diminta tidak ditemukan.'
    });
  }

  /* -------------------------------------------------------
     HTTP STATUS
  ------------------------------------------------------- */

  const candidateStatus =
    Number.isInteger(error.statusCode)
      ? error.statusCode
      : error.status;

  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus < 600
      ? candidateStatus
      : 500;

  /* -------------------------------------------------------
     SERVER ERROR LOGGING
  ------------------------------------------------------- */

  if (statusCode >= 500) {
    console.error(
      'Unhandled server error:',
      {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    );
  }

  /* -------------------------------------------------------
     RESPONSE MESSAGE
  ------------------------------------------------------- */

  let message =
    error.message ||
    'Request gagal diproses.';

  if (statusCode >= 500) {
    message = 'Internal server error';
  }

  /* -------------------------------------------------------
     RESPONSE
  ------------------------------------------------------- */

  return res.status(statusCode).json({
    success: false,
    message
  });
});

/* =========================================================
   LOCAL SERVER
========================================================= */

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(
      `Nusa Bot API berjalan di http://localhost:${PORT}`
    );
  });
}

/* =========================================================
   VERCEL
========================================================= */

export default app;