import { Router } from 'express';
import {
  getPublishedMaterialController,
  listPublishedMaterialsController
} from '../controllers/material.controller.js';

const router = Router();

router.get('/', listPublishedMaterialsController);
router.get('/:slug', getPublishedMaterialController);

export default router;