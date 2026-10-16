import { prisma } from '../lib/prisma.js';

const PRIVATE_KEYS = new Set([
  'answer',
  'answers',
  'correct',
  'iscorrect',
  'correctanswer',
  'correctanswers',
  'correctvalues',
  'correctorder',
  'expectedorder',
  'correctoptionid',
  'correctoptionids',
  'correctindex',
  'correctoptionindex',
  'correctoptionvalue',
  'correctvalue',
  'mapping',
  'solution',
  'explanation',
  'expectedmatches',
  'correctmatches'
]);

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeContent(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeContent);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(normalizeKey(key)))
      .map(([key, item]) => [key, sanitizeContent(item)])
  );
}

function getPagination(query) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 20;

  return { page, limit };
}

function publishedQuizWhere() {
  return {
    status: 'PUBLISHED',
    OR: [
      { scheduledAt: null },
      { scheduledAt: { lte: new Date() } }
    ]
  };
}

export async function publicListQuizzes(req, res) {
  try {
    const { page, limit } = getPagination(req.query);
    const where = publishedQuizWhere();

    const [quizzes, total] = await prisma.$transaction([
      prisma.quiz.findMany({
        where,
        select: {
          id: true,
          materialId: true,
          title: true,
          description: true,
          passingScore: true,
          xpPerCorrect: true,
          timeLimitSeconds: true,
          maxAttempts: true,
          order: true,
          publishedAt: true,
          _count: {
            select: { questions: true }
          }
        },
        orderBy: [
          { order: 'asc' },
          { publishedAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.quiz.count({ where })
    ]);

    const items = quizzes.map(({ _count, ...quiz }) => ({
      ...quiz,
      questionCount: _count.questions
    }));

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('publicListQuizzes:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar kuis.'
    });
  }
}

export async function getPublishedQuiz(req, res) {
  try {
    const { quizId } = req.params;

    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quizId,
        ...publishedQuizWhere()
      },
      select: {
        id: true,
        materialId: true,
        title: true,
        description: true,
        passingScore: true,
        xpPerCorrect: true,
        timeLimitSeconds: true,
        maxAttempts: true,
        order: true,
        publishedAt: true,
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            question: true,
            type: true,
            content: true,
            points: true,
            order: true,
            options: {
              orderBy: { order: 'asc' },
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
      return res.status(404).json({
        success: false,
        message: 'Kuis tidak ditemukan atau belum dipublikasikan.'
      });
    }

    const safeQuiz = {
      ...quiz,
      questions: quiz.questions.map((question) => ({
        ...question,
        content: sanitizeContent(question.content)
      }))
    };

    return res.status(200).json({
      success: true,
      data: {
        quiz: safeQuiz
      }
    });
  } catch (error) {
    console.error('getPublishedQuiz:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil detail kuis.'
    });
  }
}