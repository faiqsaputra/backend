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
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  getQuizAttempt
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
// Semua endpoint admin membutuhkan autentikasi + role ADMIN.
// ============================================================

router.use(
  requireAuth,
  requireRole('ADMIN')
);


// ============================================================
// QUIZ MANAGEMENT
// ============================================================

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


// ============================================================
// QUESTION MANAGEMENT
// ============================================================

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


// ============================================================
// QUIZ PREVIEW
// ============================================================

router.get(
  '/:quizId/preview',
  previewQuizHandler
);


// ============================================================
// QUIZ PUBLISHING
// ============================================================

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
// GET quiz dapat diakses tanpa login.
// Endpoint pengerjaan quiz membutuhkan requireAuth.
// ============================================================


// ============================================================
// PUBLIC QUIZ LIST
// GET /api/quizzes
// ============================================================

publicQuizRouter.get(
  '/',
  publicListQuizzes
);


// ============================================================
// QUIZ ATTEMPT
// ============================================================


// ------------------------------------------------------------
// START ATTEMPT
// POST /api/quizzes/:quizId/attempts
// ------------------------------------------------------------

publicQuizRouter.post(
  '/:quizId/attempts',
  requireAuth,
  startQuizAttempt
);


// ------------------------------------------------------------
// SUBMIT ANSWER
// POST /api/quizzes/attempts/:attemptId/answers
//
// Body:
// {
//   "questionId": "question_id",
//   "answer": "A"
// }
// ------------------------------------------------------------

publicQuizRouter.post(
  '/attempts/:attemptId/answers',
  requireAuth,
  submitQuizAnswer
);


// ------------------------------------------------------------
// COMPLETE ATTEMPT
// POST /api/quizzes/attempts/:attemptId/complete
// ------------------------------------------------------------

publicQuizRouter.post(
  '/attempts/:attemptId/complete',
  requireAuth,
  completeQuizAttempt
);


// ------------------------------------------------------------
// GET ATTEMPT RESULT
// GET /api/quizzes/attempts/:attemptId
// ------------------------------------------------------------

publicQuizRouter.get(
  '/attempts/:attemptId',
  requireAuth,
  getQuizAttempt
);


// ============================================================
// PUBLISHED QUIZ DETAIL
// GET /api/quizzes/:quizId
//
// Route ini diletakkan setelah seluruh route /attempts/*
// agar struktur endpoint tetap jelas.
// ============================================================

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