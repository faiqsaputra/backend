import { prisma } from '../lib/prisma.js';

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

function sendSuccess(res, message, data, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data
  });
}

function getPublishedCondition() {
  return {
    status: 'PUBLISHED',
    OR: [
      {
        scheduledAt: null
      },
      {
        scheduledAt: {
          lte: new Date()
        }
      }
    ]
  };
}

function sanitizeQuestion(question) {
  return {
    id: question.id,
    type: question.type,
    title: question.title,
    question: question.question,
    content: question.content,
    points: question.points,
    order: question.order,
    options: question.options?.map(option => ({
      id: option.id,
      label: option.label,
      value: option.value,
      order: option.order
    })) || []
  };
}

function sanitizeQuiz(quiz) {
  return {
    id: quiz.id,
    materialId: quiz.materialId,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    xpPerCorrect: quiz.xpPerCorrect,
    maxAttempts: quiz.maxAttempts,
    timeLimitSeconds: quiz.timeLimitSeconds,
    showExplanation: quiz.showExplanation,
    shuffleQuestions: quiz.shuffleQuestions,
    publishedAt: quiz.publishedAt,
    questionCount: quiz.questions?.length ?? quiz._count?.questions ?? 0
  };
}

export async function publicListQuizzes(req, res, next) {
  try {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number.parseInt(req.query.limit, 10) || 10,
        1
      ),
      50
    );

    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim()
        : '';

    const where = getPublishedCondition();

    if (search) {
      where.AND = [
        {
          OR: [
            {
              title: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              description: {
                contains: search,
                mode: 'insensitive'
              }
            }
          ]
        }
      ];
    }

    const skip = (page - 1) * limit;

    const [quizzes, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        orderBy: [
          {
            order: 'asc'
          },
          {
            publishedAt: 'desc'
          }
        ],
        skip,
        take: limit,
        select: {
          id: true,
          materialId: true,
          title: true,
          description: true,
          passingScore: true,
          xpPerCorrect: true,
          maxAttempts: true,
          timeLimitSeconds: true,
          showExplanation: true,
          shuffleQuestions: true,
          publishedAt: true,
          questions: {
            select: {
              id: true
            }
          }
        }
      }),
      prisma.quiz.count({
        where
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return sendSuccess(
      res,
      'Daftar kuis berhasil diambil.',
      {
        items: quizzes.map(sanitizeQuiz),
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      }
    );
  } catch (error) {
    return next(error);
  }
}

export async function getPublishedQuiz(req, res, next) {
  try {
    const { quizId } = req.params;

    if (!quizId || typeof quizId !== 'string') {
      return sendError(
        res,
        400,
        'Quiz ID wajib diisi.'
      );
    }

    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quizId,
        ...getPublishedCondition()
      },
      select: {
        id: true,
        materialId: true,
        title: true,
        description: true,
        passingScore: true,
        xpPerCorrect: true,
        maxAttempts: true,
        timeLimitSeconds: true,
        showExplanation: true,
        shuffleQuestions: true,
        publishedAt: true,
        material: {
          select: {
            id: true,
            title: true,
            slug: true
          }
        },
        questions: {
          orderBy: {
            order: 'asc'
          },
          select: {
            id: true,
            type: true,
            title: true,
            question: true,
            content: true,
            points: true,
            order: true,
            options: {
              orderBy: {
                order: 'asc'
              },
              select: {
                id: true,
                label: true,
                value: true,
                order: true
              }
            }
          }
        }
      }
    });

    if (!quiz) {
      return sendError(
        res,
        404,
        'Kuis tidak ditemukan atau belum dipublikasikan.'
      );
    }

    return sendSuccess(
      res,
      'Detail kuis berhasil diambil.',
      {
        ...sanitizeQuiz(quiz),
        material: quiz.material,
        questions: quiz.questions.map(sanitizeQuestion)
      }
    );
  } catch (error) {
    return next(error);
  }
}