import { Router } from 'express';

import {
  listQuizzes,
  quizStats,
  getQuiz,
  createQuizHandler,
  updateQuizHandler,
  deleteQuizHandler,
  listQuizQuestions,
  getQuizQuestion,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  reorderQuizQuestions,
  previewQuizHandler,
  validateQuizPublish,
  publishQuizHandler,
  unpublishQuizHandler,
  archiveQuizHandler
} from '../controllers/quiz.controller.js';

import {
  publicListQuizzes,
  getPublishedQuiz
} from '../controllers/public-quiz.controller.js';

import {
  startQuizAttemptController,
  submitQuizAnswerController,
  completeQuizAttemptController,
  getQuizAttemptController
} from '../controllers/quiz-attempt.controller.js';

import {
  requireAuth,
  requireRole
} from '../middleware/auth.js';

const router = Router();
const publicQuizRouter = Router();


// ============================================================
// ADMIN QUIZ ROUTES
// Prefix: /api/admin/quizzes
// ============================================================

router.use(
  requireAuth,
  requireRole('ADMIN')
);


// ------------------------------------------------------------
// Quiz management
// ------------------------------------------------------------

router.get(
  '/stats',
  quizStats
);

router.get(
  '/',
  listQuizzes
);

router.post(
  '/',
  createQuizHandler
);

router.get(
  '/:quizId',
  getQuiz
);

router.patch(
  '/:quizId',
  updateQuizHandler
);

router.delete(
  '/:quizId',
  deleteQuizHandler
);


// ------------------------------------------------------------
// Question management
// ------------------------------------------------------------

router.get(
  '/:quizId/questions',
  listQuizQuestions
);

router.post(
  '/:quizId/questions',
  createQuizQuestion
);

router.patch(
  '/:quizId/questions/reorder',
  reorderQuizQuestions
);

router.get(
  '/:quizId/questions/:questionId',
  getQuizQuestion
);

router.patch(
  '/:quizId/questions/:questionId',
  updateQuizQuestion
);

router.delete(
  '/:quizId/questions/:questionId',
  deleteQuizQuestion
);


// ------------------------------------------------------------
// Preview
// ------------------------------------------------------------

router.get(
  '/:quizId/preview',
  previewQuizHandler
);


// ------------------------------------------------------------
// Publishing
// ------------------------------------------------------------

router.post(
  '/:quizId/validate-publish',
  validateQuizPublish
);

router.post(
  '/:quizId/publish',
  publishQuizHandler
);

router.post(
  '/:quizId/unpublish',
  unpublishQuizHandler
);

router.post(
  '/:quizId/archive',
  archiveQuizHandler
);


// ============================================================
// PUBLIC QUIZ ROUTES
// Prefix: /api/quizzes
//
// GET dapat diakses tanpa login.
// Endpoint pengerjaan quiz menggunakan requireAuth.
// ============================================================


// ------------------------------------------------------------
// Public quiz list
// GET /api/quizzes
// ------------------------------------------------------------

publicQuizRouter.get(
  '/',
  publicListQuizzes
);


// ------------------------------------------------------------
// IMPORTANT:
//
// Route /attempts/... harus diletakkan SEBELUM
// route /:quizId agar struktur routing lebih jelas.
// ------------------------------------------------------------


// ------------------------------------------------------------
// Start quiz attempt
//
// POST /api/quizzes/:quizId/attempts
//
// Header:
// Authorization: Bearer <supabase_access_token>
//
// Body:
// {}
// ------------------------------------------------------------

publicQuizRouter.post(
  '/:quizId/attempts',
  requireAuth,
  startQuizAttemptController
);


// ------------------------------------------------------------
// Submit answer
//
// POST /api/quizzes/attempts/:attemptId/answers
//
// Body:
// {
//   "questionId": "xxx",
//   "answer": "A"
// }
// ------------------------------------------------------------

publicQuizRouter.post(
  '/attempts/:attemptId/answers',
  requireAuth,
  submitQuizAnswerController
);


// ------------------------------------------------------------
// Complete attempt
//
// POST /api/quizzes/attempts/:attemptId/complete
//
// Body:
// {}
// ------------------------------------------------------------

publicQuizRouter.post(
  '/attempts/:attemptId/complete',
  requireAuth,
  completeQuizAttemptController
);


// ------------------------------------------------------------
// Get attempt result
//
// GET /api/quizzes/attempts/:attemptId
// ------------------------------------------------------------

publicQuizRouter.get(
  '/attempts/:attemptId',
  requireAuth,
  getQuizAttemptController
);


// ------------------------------------------------------------
// Published quiz detail
//
// GET /api/quizzes/:quizId
//
// Sengaja diletakkan setelah route attempts.
// ------------------------------------------------------------

publicQuizRouter.get(
  '/:quizId',
  getPublishedQuiz
);


// ============================================================
// EXPORT
// ============================================================

export {
  publicQuizRouter
};

export default router;