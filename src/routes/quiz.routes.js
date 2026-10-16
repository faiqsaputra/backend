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
    getPublishedQuiz,
    startQuizAttempt,
    submitQuizAnswer,
    completeQuizAttempt,
    getQuizAttempt
} from '../controllers/public-quiz.controller.js';

import {
    requireAuth,
    requireRole
} from '../middleware/auth.js';


// ============================================================
// ROUTER INITIALIZATION
// ============================================================

const router = Router();
const publicQuizRouter = Router();


// ============================================================
// ADMIN QUIZ ROUTES
// Prefix: /api/admin/quizzes
// ============================================================

router.use(requireAuth, requireRole('ADMIN'));


// Quiz management
router.get('/stats', quizStats);
router.get('/', listQuizzes);
router.post('/', createQuizHandler);
router.get('/:quizId', getQuiz);
router.patch('/:quizId', updateQuizHandler);
router.delete('/:quizId', deleteQuizHandler);


// Question management
router.get('/:quizId/questions', listQuizQuestions);
router.post('/:quizId/questions', createQuizQuestion);

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


// Quiz preview
router.get('/:quizId/preview', previewQuizHandler);


// Quiz publishing
router.post('/:quizId/validate-publish', validateQuizPublish);
router.post('/:quizId/publish', publishQuizHandler);
router.post('/:quizId/unpublish', unpublishQuizHandler);
router.post('/:quizId/archive', archiveQuizHandler);


// ============================================================
// PUBLIC QUIZ ROUTES
// Prefix: /api/quizzes
// ============================================================

// Daftar kuis yang dipublikasikan
publicQuizRouter.get('/', publicListQuizzes);

// Memulai pengerjaan kuis
publicQuizRouter.post(
    '/:quizId/attempts',
    requireAuth,
    startQuizAttempt
);

// Menyimpan jawaban
publicQuizRouter.post(
    '/attempts/:attemptId/answers',
    requireAuth,
    submitQuizAnswer
);

// Menyelesaikan pengerjaan kuis
publicQuizRouter.post(
    '/attempts/:attemptId/complete',
    requireAuth,
    completeQuizAttempt
);

// Melihat hasil pengerjaan
publicQuizRouter.get(
    '/attempts/:attemptId',
    requireAuth,
    getQuizAttempt
);

// Detail kuis yang sudah dipublikasikan
publicQuizRouter.get('/:quizId', getPublishedQuiz);


// ============================================================
// EXPORT
// ============================================================

export { publicQuizRouter };
export default router;