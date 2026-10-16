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

import quizRouter, {
  publicQuizRouter
} from './routes/quiz.routes.js';

import cycleRoutes from './routes/cycle.routes.js';


/*
|--------------------------------------------------------------------------
| APPLICATION
|--------------------------------------------------------------------------
*/

const app = express();

const PORT = Number(process.env.PORT) || 5000;

const isVercel = Boolean(process.env.VERCEL);

const isProduction =
  process.env.NODE_ENV === 'production' ||
  isVercel;


/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:'
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}


const configuredOrigins = (
  process.env.CORS_ORIGINS || ''
)
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);


const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];


const productionOrigins = [
  'https://frontend-nisabot.vercel.app'
];


const allowedOrigins = new Set([
  ...(isProduction
    ? productionOrigins
    : developmentOrigins),

  ...configuredOrigins
]);


console.log(
  '[CORS] Allowed origins:',
  [...allowedOrigins]
);


const corsOptions = {
  origin(origin, callback) {
    /*
     * Request tanpa Origin biasanya berasal dari:
     *
     * - curl
     * - server-to-server
     * - monitoring
     * - health check
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
     * Jangan throw error di sini.
     *
     * Kalau callback(error), Express dapat menghasilkan
     * response 403 tanpa header CORS yang kemudian terlihat
     * seperti CORS error di browser.
     */

    return callback(null, false);
  },

  credentials: true,

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

  optionsSuccessStatus: 204
};


/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

app.disable('x-powered-by');


if (isProduction) {
  app.set('trust proxy', 1);
}


app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);


/*
|--------------------------------------------------------------------------
| CORS MIDDLEWARE
|--------------------------------------------------------------------------
|
| PENTING:
|
| Jangan menggunakan:
|
| app.options('*', ...)
|
| Express 5 + path-to-regexp akan menghasilkan:
|
| PathError: Missing parameter name at index 1: *
|
| cors() sendiri sudah menangani OPTIONS/preflight.
|
|--------------------------------------------------------------------------
*/

app.use(cors(corsOptions));


/*
|--------------------------------------------------------------------------
| BODY PARSER
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| RATE LIMITER
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| ROOT
|--------------------------------------------------------------------------
*/

app.get('/', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    status: 'online'
  });
});


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
|
| Endpoint ini tidak menggunakan:
|
| - Prisma
| - Supabase
| - Authentication
|
| Jadi cocok untuk memastikan Vercel Function
| berhasil dijalankan.
|
|--------------------------------------------------------------------------
*/

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    timestamp: new Date().toISOString()
  });
});


/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
|
| /api/auth/register
| /api/auth/me
| dan route auth lainnya.
|
|--------------------------------------------------------------------------
*/

app.use(
  '/api/auth',
  apiLimiter,
  authLimiter,
  authRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
*/

app.use(
  '/api/admin',
  apiLimiter,
  adminRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN MATERIALS
|--------------------------------------------------------------------------
*/

app.use(
  '/api/admin/materials',
  apiLimiter,
  materialRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN VIDEOS
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| PUBLIC MATERIALS
|--------------------------------------------------------------------------
*/

app.use(
  '/api/materials',
  apiLimiter,
  publicMaterialRoutes
);


/*
|--------------------------------------------------------------------------
| PUBLIC VIDEOS
|--------------------------------------------------------------------------
*/

app.use(
  '/api/videos',
  apiLimiter,
  publicVideoRoutes
);


/*
|--------------------------------------------------------------------------
| QUIZ ADMIN
|--------------------------------------------------------------------------
*/

app.use(
  '/api/admin/quizzes',
  apiLimiter,
  quizRouter
);


/*
|--------------------------------------------------------------------------
| PUBLIC QUIZ
|--------------------------------------------------------------------------
*/

app.use(
  '/api/quizzes',
  apiLimiter,
  publicQuizRouter
);


/*
|--------------------------------------------------------------------------
| MENSTRUAL CYCLE
|--------------------------------------------------------------------------
*/

app.use(
  '/api/cycles',
  apiLimiter,
  cycleRoutes
);


/*
|--------------------------------------------------------------------------
| 404 API
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl
  });
});


/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, _req, res, next) => {
  /*
   * Kalau response sudah dikirim,
   * serahkan error ke Express.
   */

  if (res.headersSent) {
    return next(error);
  }


  console.error(
    '[SERVER ERROR]',
    {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    }
  );


  /*
   * Invalid JSON
   */

  if (
    error?.type === 'entity.parse.failed'
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Format JSON request tidak valid.'
    });
  }


  /*
   * Request terlalu besar
   */

  if (
    error?.type === 'entity.too.large'
  ) {
    return res.status(413).json({
      success: false,
      message:
        'Ukuran request melebihi batas 1 MB.'
    });
  }


  /*
   * Prisma P2002
   */

  if (
    error?.code === 'P2002'
  ) {
    return res.status(409).json({
      success: false,
      message:
        'Data bertentangan dengan data yang sudah ada.'
    });
  }


  /*
   * Prisma P2003
   */

  if (
    error?.code === 'P2003'
  ) {
    return res.status(409).json({
      success: false,
      message:
        'Operasi ditolak karena masih memiliki relasi data.'
    });
  }


  /*
   * Prisma P2025
   */

  if (
    error?.code === 'P2025'
  ) {
    return res.status(404).json({
      success: false,
      message:
        'Data yang diminta tidak ditemukan.'
    });
  }


  /*
   * HTTP status dari error
   */

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


  /*
   * Production tidak membocorkan detail
   * internal error ke client.
   */

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


/*
|--------------------------------------------------------------------------
| LOCAL DEVELOPMENT
|--------------------------------------------------------------------------
*/

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(
      `Nusa Bot API berjalan di http://localhost:${PORT}`
    );
  });
}


/*
|--------------------------------------------------------------------------
| VERCEL
|--------------------------------------------------------------------------
|
| Vercel membutuhkan Express app sebagai default export.
|
|--------------------------------------------------------------------------
*/

export default app;