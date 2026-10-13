import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  try {
    const [users, materials, quizzes, questions, recentMaterials] = await Promise.all([
      prisma.user.count(),
      prisma.material.count(),
      prisma.quiz.count(),
      prisma.question.count(),
      prisma.material.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 5
      })
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        users,
        materials,
        quizzes,
        questions
      },
      recentMaterials
    });
  } catch (error) {
    console.error('GET /api/admin/dashboard:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat dashboard admin.'
    });
  }
});

export default router;