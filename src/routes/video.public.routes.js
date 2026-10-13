import { Router } from 'express';

import {
  getPublishedVideoController,
  listPublishedVideosController
} from '../controllers/video.controller.js';

const router = Router();

router.get('/', listPublishedVideosController);
router.get('/:slug', getPublishedVideoController);

export default router;