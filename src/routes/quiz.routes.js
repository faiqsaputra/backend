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


// ============================================================
// ROUTER INITIALIZATION
// ============================================================

const adminQuizRouter = Router();
const publicQuizRouter = Router();


// ============================================================
// ADMIN MIDDLEWARE
// Prefix: /api/admin/quizzes
//
// Semua endpoint ADMIN wajib menggunakan autentikasi
// dan memiliki role ADMIN.
// ============================================================

adminQuizRouter.use(requireAuth, requireRole('ADMIN'));


// ============================================================
// ADMIN: QUIZ STATISTICS
// ============================================================

// GET /api/admin/quizzes/stats
adminQuizRouter.get('/stats', quizStats);


// ============================================================
// ADMIN: QUIZ MANAGEMENT
// ============================================================

// GET  /api/admin/quizzes
// POST /api/admin/quizzes

adminQuizRouter.get('/', listQuizzes);
adminQuizRouter.post('/', createQuizHandler);


// ============================================================
// ADMIN: QUESTION MANAGEMENT
// ============================================================

// GET  /api/admin/quizzes/:quizId/questions
// POST /api/admin/quizzes/:quizId/questions

adminQuizRouter.get('/:quizId/questions', listQuizQuestions);
adminQuizRouter.post('/:quizId/questions', createQuizQuestion);


// PATCH /api/admin/quizzes/:quizId/questions/reorder
adminQuizRouter.patch('/:quizId/questions/reorder', reorderQuizQuestions);


// GET    /api/admin/quizzes/:quizId/questions/:questionId
// PATCH  /api/admin/quizzes/:quizId/questions/:questionId
// DELETE /api/admin/quizzes/:quizId/questions/:questionId

adminQuizRouter.get(
    '/:quizId/questions/:questionId',
    getQuizQuestion
);

adminQuizRouter.patch(
    '/:quizId/questions/:questionId',
    updateQuizQuestion
);

adminQuizRouter.delete(
    '/:quizId/questions/:questionId',
    deleteQuizQuestion
);


// ============================================================
// ADMIN: QUIZ PREVIEW
// ============================================================

// GET /api/admin/quizzes/:quizId/preview
adminQuizRouter.get('/:quizId/preview', previewQuizHandler);


// ============================================================
// ADMIN: QUIZ PUBLISHING
// ============================================================

// POST /api/admin/quizzes/:quizId/validate-publish
adminQuizRouter.post(
    '/:quizId/validate-publish',
    validateQuizPublish
);

// POST /api/admin/quizzes/:quizId/publish
adminQuizRouter.post('/:quizId/publish', publishQuizHandler);

// POST /api/admin/quizzes/:quizId/unpublish
adminQuizRouter.post('/:quizId/unpublish', unpublishQuizHandler);

// POST /api/admin/quizzes/:quizId/archive
adminQuizRouter.post('/:quizId/archive', archiveQuizHandler);


// ============================================================
// ADMIN: QUIZ DETAIL
// ============================================================

// GET    /api/admin/quizzes/:quizId
// PATCH  /api/admin/quizzes/:quizId
// DELETE /api/admin/quizzes/:quizId

adminQuizRouter.get('/:quizId', getQuiz);
adminQuizRouter.patch('/:quizId', updateQuizHandler);
adminQuizRouter.delete('/:quizId', deleteQuizHandler);


// ============================================================
// PUBLIC: QUIZ CATALOG
// Prefix: /api/quizzes
//
// Pengguna dapat melihat kuis yang sudah dipublikasikan
// tanpa harus login.
// ============================================================

// GET /api/quizzes
publicQuizRouter.get('/', publicListQuizzes);


// ============================================================
// PUBLIC: START QUIZ ATTEMPT
// ============================================================

// POST /api/quizzes/:quizId/attempts
// Membutuhkan autentikasi.

publicQuizRouter.post(
    '/:quizId/attempts',
    requireAuth,
    startQuizAttempt
);


// ============================================================
// PUBLIC: SUBMIT ANSWER
// ============================================================

// POST /api/quizzes/attempts/:attemptId/answers
// Body:
// {
//     "questionId": "question_id",
//     "answer": "A"
// }

publicQuizRouter.post(
    '/attempts/:attemptId/answers',
    requireAuth,
    submitQuizAnswer
);


// ============================================================
// PUBLIC: COMPLETE QUIZ ATTEMPT
// ============================================================

// POST /api/quizzes/attempts/:attemptId/complete

publicQuizRouter.post(
    '/attempts/:attemptId/complete',
    requireAuth,
    completeQuizAttempt
);


// ============================================================
// PUBLIC: GET QUIZ ATTEMPT RESULT
// ============================================================

// GET /api/quizzes/attempts/:attemptId

publicQuizRouter.get(
    '/attempts/:attemptId',
    requireAuth,
    getQuizAttempt
);


// ============================================================
// PUBLIC: PUBLISHED QUIZ DETAIL
// ============================================================

// GET /api/quizzes/:quizId
// Hanya boleh mengembalikan kuis yang sudah dipublikasikan.

publicQuizRouter.get('/:quizId', getPublishedQuiz);


// ============================================================
// EXPORT ROUTERS
// ============================================================

// Default export digunakan untuk ADMIN routes.
export default adminQuizRouter;

// Named export digunakan untuk PUBLIC routes.
export { publicQuizRouter };