import { Router } from 'express';

import {
    publicListQuizzes,
    getPublishedQuiz,
    startQuizAttempt,
    submitQuizAnswer,
    completeQuizAttempt,
    getQuizAttempt
} from '../controllers/public-quiz.controller.js';

import { requireAuth } from '../middleware/auth.js';


// ============================================================
// ROUTER INITIALIZATION
// Prefix: /api/quizzes
// ============================================================

const router = Router();


// ============================================================
// PUBLIC: QUIZ CATALOG
// ============================================================

// GET /api/quizzes
// Menampilkan daftar kuis yang telah dipublikasikan.

router.get(
    '/',
    publicListQuizzes
);


// ============================================================
// PUBLIC: START QUIZ ATTEMPT
// ============================================================

// POST /api/quizzes/:quizId/attempts
// Membuat sesi pengerjaan kuis.
// Requires authentication.

router.post(
    '/:quizId/attempts',
    requireAuth,
    startQuizAttempt
);


// ============================================================
// PUBLIC: SUBMIT QUIZ ANSWER
// ============================================================

// POST /api/quizzes/attempts/:attemptId/answers
// Menyimpan dan menilai jawaban pengguna.
// Requires authentication.

router.post(
    '/attempts/:attemptId/answers',
    requireAuth,
    submitQuizAnswer
);


// ============================================================
// PUBLIC: COMPLETE QUIZ ATTEMPT
// ============================================================

// POST /api/quizzes/attempts/:attemptId/complete
// Menyelesaikan pengerjaan dan menghitung hasil akhir.
// Requires authentication.

router.post(
    '/attempts/:attemptId/complete',
    requireAuth,
    completeQuizAttempt
);


// ============================================================
// PUBLIC: GET QUIZ ATTEMPT RESULT
// ============================================================

// GET /api/quizzes/attempts/:attemptId
// Mengambil hasil pengerjaan milik pengguna.
// Requires authentication.

router.get(
    '/attempts/:attemptId',
    requireAuth,
    getQuizAttempt
);


// ============================================================
// PUBLIC: PUBLISHED QUIZ DETAIL
// ============================================================

// GET /api/quizzes/:quizId
// Menampilkan detail kuis yang telah dipublikasikan.

router.get(
    '/:quizId',
    getPublishedQuiz
);


// ============================================================
// EXPORT
// ============================================================

export default router;