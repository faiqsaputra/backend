import { prisma } from '../lib/prisma.js';

/**
 * Field yang tidak boleh bocor ke client/public quiz.
 *
 * Jangan pernah mengirim:
 * - answer
 * - correct answer
 * - explanation
 * - isCorrect pada option
 * - mapping/jawaban internal lainnya
 */
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
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Membersihkan JSON content dari informasi jawaban.
 *
 * Ini berguna karena Question.content adalah Json?
 * dan bisa saja berisi konfigurasi seperti:
 *
 * {
 *   "image": "...",
 *   "correctAnswer": "...",
 *   "explanation": "..."
 * }
 */
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
      .map(([key, item]) => [
        key,
        sanitizeContent(item)
      ])
  );
}

/**
 * Pagination public quiz.
 */
function getPagination(query = {}) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 20;

  return {
    page,
    limit
  };
}

/**
 * Kondisi quiz yang boleh dilihat peserta.
 *
 * Quiz harus:
 * 1. status PUBLISHED
 * 2. jika memiliki scheduledAt, waktunya sudah tiba
 */
function publishedQuizWhere() {
  const now = new Date();

  return {
    status: 'PUBLISHED',

    OR: [
      {
        scheduledAt: null
      },
      {
        scheduledAt: {
          lte: now
        }
      }
    ]
  };
}

/**
 * =========================================================
 * GET PUBLIC QUIZ LIST
 * GET /api/quizzes
 * =========================================================
 */
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
            select: {
              questions: true
            }
          }
        },

        orderBy: [
          {
            order: 'asc'
          },
          {
            publishedAt: 'desc'
          }
        ],

        skip: (page - 1) * limit,
        take: limit
      }),

      prisma.quiz.count({
        where
      })
    ]);

    const items = quizzes.map((quiz) => ({
      id: quiz.id,
      materialId: quiz.materialId,

      title: quiz.title,
      description: quiz.description,

      passingScore: quiz.passingScore,
      xpPerCorrect: quiz.xpPerCorrect,

      timeLimitSeconds: quiz.timeLimitSeconds,
      maxAttempts: quiz.maxAttempts,

      order: quiz.order,
      publishedAt: quiz.publishedAt,

      questionCount: quiz._count.questions
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

/**
 * =========================================================
 * GET PUBLIC QUIZ DETAIL
 * GET /api/quizzes/:quizId
 * =========================================================
 *
 * Endpoint ini digunakan ketika siswa membuka kuis.
 *
 * Yang dikirim:
 * - data quiz
 * - pertanyaan
 * - pilihan jawaban
 *
 * Yang TIDAK dikirim:
 * - Question.answer
 * - Question.explanation
 * - QuestionOption.isCorrect
 */
export async function getPublishedQuiz(req, res) {
  try {
    const { quizId } = req.params;

    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: 'ID kuis wajib diisi.'
      });
    }

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

        showExplanation: true,
        shuffleQuestions: true,

        questions: {
          orderBy: [
            {
              order: 'asc'
            },
            {
              createdAt: 'asc'
            }
          ],

          select: {
            id: true,

            title: true,
            question: true,

            type: true,
            content: true,

            points: true,
            order: true,

            /**
             * Hanya kirim data public dari option.
             *
             * isCorrect sengaja TIDAK di-select.
             */
            options: {
              orderBy: [
                {
                  order: 'asc'
                },
                {
                  createdAt: 'asc'
                }
              ],

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

    /**
     * Sanitasi content JSON.
     *
     * Walaupun field answer/explanation sudah tidak di-select
     * secara langsung, content tetap harus dibersihkan karena
     * Question.content bisa menyimpan informasi sensitif.
     */
    const questions = quiz.questions.map((question) => ({
      id: question.id,

      title: question.title,
      question: question.question,

      type: question.type,

      content: sanitizeContent(question.content),

      points: question.points,
      order: question.order,

      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        order: option.order
      }))
    }));

    /**
     * Shuffle pertanyaan jika konfigurasi quiz mengaktifkannya.
     *
     * Catatan:
     * Shuffle di sini hanya untuk tampilan peserta.
     * Nilai `order` database tetap tidak berubah.
     */
    let publicQuestions = questions;

    if (quiz.shuffleQuestions) {
      publicQuestions = shuffleArray(questions);
    }

    /**
     * Jangan expose konfigurasi internal yang tidak dibutuhkan
     * oleh halaman peserta.
     */
    const safeQuiz = {
      id: quiz.id,
      materialId: quiz.materialId,

      title: quiz.title,
      description: quiz.description,

      passingScore: quiz.passingScore,
      xpPerCorrect: quiz.xpPerCorrect,

      timeLimitSeconds: quiz.timeLimitSeconds,
      maxAttempts: quiz.maxAttempts,

      order: quiz.order,
      publishedAt: quiz.publishedAt,

      showExplanation: quiz.showExplanation,

      questionCount: publicQuestions.length,

      questions: publicQuestions
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

/**
 * Fisher-Yates shuffle.
 */
function shuffleArray(items) {
  const array = [...items];

  for (let i = array.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1)
    );

    [
      array[i],
      array[randomIndex]
    ] = [
      array[randomIndex],
      array[i]
    ];
  }

  return array;
}