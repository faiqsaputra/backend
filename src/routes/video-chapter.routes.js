import { Router } from 'express';

import { requireAuth, requireRole } from '../middleware/auth.js';

import {
  createChapter,
  listChapters,
  removeChapter,
  updateChapter
} from '../controllers/video-chapter.controller.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/:videoId/chapters', listChapters);
router.post('/:videoId/chapters', createChapter);
router.put('/:videoId/chapters/:chapterId', updateChapter);
router.delete('/:videoId/chapters/:chapterId', removeChapter);

export default router;