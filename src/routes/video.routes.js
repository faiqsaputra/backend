import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

import {
  archiveVideoController,
  createVideoController,
  getAdminVideoController,
  listAdminVideosController,
  updateVideoController,
  updateVideoStatusController
} from '../controllers/video.controller.js';

const router = Router();

router.use(
  requireAuth,
  requireRole('ADMIN')
);

router.get('/', listAdminVideosController);
router.get('/:id', getAdminVideoController);
router.post('/', createVideoController);
router.patch('/:id', updateVideoController);
router.patch('/:id/status', updateVideoStatusController);
router.delete('/:id', archiveVideoController);

export default router;