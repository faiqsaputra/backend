import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  archiveMaterialController,
  createMaterialController,
  getAdminMaterialController,
  listAdminMaterialsController,
  statsMaterialsController,
  updateMaterialController,
  updateMaterialStatusController
} from '../controllers/material.controller.js';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/stats', statsMaterialsController);
router.get('/', listAdminMaterialsController);
router.get('/:id', getAdminMaterialController);
router.post('/', createMaterialController);
router.patch('/:id', updateMaterialController);
router.patch('/:id/status', updateMaterialStatusController);
router.delete('/:id', archiveMaterialController);

export default router;