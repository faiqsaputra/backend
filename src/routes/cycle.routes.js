import { Router } from 'express';

import {
  createCycleController,
  deleteCycleController,
  getCycleController,
  getCyclePredictionController,
  listCyclesController,
  updateCycleController
} from '../controllers/cycle.controller.js';

import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/prediction', getCyclePredictionController);
router.get('/', listCyclesController);
router.post('/', createCycleController);
router.get('/:id', getCycleController);
router.put('/:id', updateCycleController);
router.delete('/:id', deleteCycleController);

export default router;