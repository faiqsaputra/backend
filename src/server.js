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

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);

function normalizeOrigin(value) {
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
  .map(origin => normalizeOrigin(origin))
  .filter(Boolean);

const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const allowedOrigins = new Set(
  configuredOrigins.length
    ? configuredOrigins
    : isProduction
      ? []
      : developmentOrigins
);

if (isProduction && allowedOrigins.size === 0) {
  console.warn(
    '[CORS] CORS_ORIGINS belum dikonfigurasi. ' +
    'Request browser dari origin lain akan ditolak.'
  );
}

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

app.disable('x-powered-by');

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    // Request server-to-server dan tools seperti curl tidak selalu
    // mengirim header Origin.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    const error = new Error('Origin not allowed by CORS');
    error.statusCode = 403;

    return callback(error);
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({
  extended: false,
  limit: '1mb'
}));

// Health check — tidak melakukan query database.
app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Nusa Bot API is running',
    timestamp: new Date().toISOString()
  });
});

// Authentication
app.use('/api/auth', apiLimiter, authLimiter, authRoutes);

// Admin dashboard
app.use('/api/admin', apiLimiter, adminRoutes);

// Admin content management
app.use('/api/admin/materials', apiLimiter, materialRoutes);
app.use('/api/admin/videos', apiLimiter, videoRoutes);
app.use('/api/admin/videos', apiLimiter, videoChapterRoutes);

// Public content
app.use('/api/materials', apiLimiter, publicMaterialRoutes);
app.use('/api/videos', apiLimiter, publicVideoRoutes);

// Quiz management and public quiz
app.use('/api/admin/quizzes', apiLimiter, quizRouter);
app.use('/api/quizzes', apiLimiter, publicQuizRouter);

// Menstrual cycle
app.use('/api/cycles', apiLimiter, cycleRoutes);

// API not found
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Format JSON request tidak valid.'
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Ukuran request melebihi batas 1 MB.'
    });
  }

  if (error.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'Data bertentangan dengan data yang sudah ada.'
    });
  }

  if (error.code === 'P2003') {
    return res.status(409).json({
      success: false,
      message: 'Operasi ditolak karena masih memiliki relasi data.'
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Data yang diminta tidak ditemukan.'
    });
  }

  const candidateStatus = Number.isInteger(error.statusCode)
    ? error.statusCode
    : error.status;

  const statusCode =
    Number.isInteger(candidateStatus) &&
    candidateStatus >= 400 &&
    candidateStatus < 500
      ? candidateStatus
      : 500;

  if (statusCode >= 500) {
    console.error('Unhandled server error:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  }

  const message = statusCode >= 500
    ? 'Internal server error'
    : statusCode === 403
      ? 'Origin tidak diizinkan mengakses API.'
      : error.message || 'Request gagal diproses.';

  return res.status(statusCode).json({
    success: false,
    message
  });
});

// Vercel menggunakan default export.
// Listener hanya dijalankan ketika server lokal digunakan.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Nusa Bot API berjalan di http://localhost:${PORT}`);
  });
}

export default app;