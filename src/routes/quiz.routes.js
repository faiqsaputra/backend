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

import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const publicQuizRouter = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', quizStats);
router.get('/', listQuizzes);

router.post('/', createQuizHandler);
router.get('/:quizId', getQuiz);
router.patch('/:quizId', updateQuizHandler);
router.delete('/:quizId', deleteQuizHandler);

router.get('/:quizId/questions', listQuizQuestions);
router.post('/:quizId/questions', createQuizQuestion);
router.patch('/:quizId/questions/reorder', reorderQuizQuestions);
router.get('/:quizId/questions/:questionId', getQuizQuestion);
router.patch('/:quizId/questions/:questionId', updateQuizQuestion);
router.delete('/:quizId/questions/:questionId', deleteQuizQuestion);

router.get('/:quizId/preview', previewQuizHandler);
router.post('/:quizId/validate-publish', validateQuizPublish);
router.post('/:quizId/publish', publishQuizHandler);
router.post('/:quizId/unpublish', unpublishQuizHandler);
router.post('/:quizId/archive', archiveQuizHandler);

// Public quiz routes
publicQuizRouter.get('/', publicListQuizzes);
publicQuizRouter.get('/:quizId', getPublishedQuiz);

export { publicQuizRouter };
export default router;