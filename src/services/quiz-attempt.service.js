import { prisma } from '../lib/prisma.js';

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function publishedQuizWhere() {
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

function normalizeAnswer(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeAnswer(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeAnswer(item)
      ])
    );
  }

  return value;
}

function answersEqual(left, right) {
  const a = normalizeAnswer(left);
  const b = normalizeAnswer(right);

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    const normalizedA = a
      .map(item => JSON.stringify(item))
      .sort();

    const normalizedB = b
      .map(item => JSON.stringify(item))
      .sort();

    return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

function getCorrectOptionValues(question) {
  if (!Array.isArray(question.options)) {
    return [];
  }

  return question.options
    .filter(option => option.isCorrect)
    .map(option => option.value);
}

/**
 * =========================================================
 * QUESTION ANSWER EVALUATION
 * =========================================================
 *
 * Evaluasi dilakukan berdasarkan:
 *
 * 1. Question.answer
 * 2. Question.options.isCorrect
 *
 * Karena schema Question.answer adalah Json,
 * formatnya bisa berbeda tergantung question type.
 */

function evaluateAnswer(question, submittedAnswer) {
  const type = String(question.type || '').toUpperCase();

  const answer = normalizeAnswer(submittedAnswer);

  /**
   * SINGLE CHOICE
   *
   * Jawaban frontend:
   * "A"
   *
   * atau:
   * "option-id"
   */
  if (
    type === 'SINGLE_CHOICE' ||
    type === 'SINGLE' ||
    type === 'CHOICE'
  ) {
    const correctValues = getCorrectOptionValues(question);

    if (correctValues.length > 0) {
      return correctValues.some(correct =>
        answersEqual(correct, answer)
      );
    }

    return answersEqual(question.answer, answer);
  }

  /**
   * MULTIPLE CHOICE
   *
   * Jawaban frontend:
   *
   * ["A", "C"]
   */
  if (
    type === 'MULTIPLE_CHOICE' ||
    type === 'MULTIPLE'
  ) {
    const correctValues = getCorrectOptionValues(question);

    if (correctValues.length > 0) {
      return answersEqual(correctValues, answer);
    }

    return answersEqual(question.answer, answer);
  }

  /**
   * TRUE / FALSE
   */
  if (
    type === 'TRUE_FALSE' ||
    type === 'TRUEFALSE' ||
    type === 'BOOLEAN'
  ) {
    return answersEqual(question.answer, answer);
  }

  /**
   * TEXT / SHORT ANSWER
   *
   * Backend mendukung:
   *
   * answer: "haid"
   *
   * atau:
   *
   * answer: ["haid", "menstruasi"]
   */
  if (
    type === 'TEXT' ||
    type === 'SHORT_TEXT' ||
    type === 'SHORT_ANSWER'
  ) {
    const expected = normalizeAnswer(question.answer);

    if (Array.isArray(expected)) {
      return expected.some(item =>
        answersEqual(item, answer)
      );
    }

    return answersEqual(expected, answer);
  }

  /**
   * MATCHING / ORDER / CUSTOM
   *
   * Karena format Json fleksibel,
   * gunakan comparison terhadap Question.answer.
   */
  return answersEqual(question.answer, answer);
}

/**
 * =========================================================
 * GET QUIZ
 * =========================================================
 */

export async function getPublishedQuizForAttempt(quizId) {
  const quiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,
      ...publishedQuizWhere()
    },
    select: {
      id: true,
      title: true,
      passingScore: true,
      xpPerCorrect: true,
      maxAttempts: true,
      timeLimitSeconds: true,
      shuffleQuestions: true,
      showExplanation: true,
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
          answer: true,
          explanation: true,
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
              isCorrect: true,
              order: true
            }
          }
        }
      }
    }
  });

  if (!quiz) {
    throw createServiceError(
      'Kuis tidak ditemukan atau belum dipublikasikan.',
      404
    );
  }

  return quiz;
}

/**
 * =========================================================
 * START ATTEMPT
 * =========================================================
 */

export async function startQuizAttempt({
  quizId,
  userId
}) {
  if (!userId) {
    throw createServiceError(
      'User tidak ditemukan.',
      401
    );
  }

  const quiz = await getPublishedQuizForAttempt(quizId);

  if (!quiz.questions.length) {
    throw createServiceError(
      'Kuis belum memiliki soal.',
      400
    );
  }

  /**
   * Cek maxAttempts.
   *
   * Hanya attempt yang sudah dibuat yang dihitung.
   */
  if (
    Number.isInteger(quiz.maxAttempts) &&
    quiz.maxAttempts > 0
  ) {
    const attemptCount = await prisma.quizAttempt.count({
      where: {
        quizId,
        userId
      }
    });

    if (attemptCount >= quiz.maxAttempts) {
      throw createServiceError(
        `Batas percobaan kuis telah tercapai. Maksimal ${quiz.maxAttempts} percobaan.`,
        403
      );
    }
  }

  /**
   * Buat attempt baru.
   */
  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      quizId,
      score: 0,
      percentage: 0,
      passed: false
    },
    select: {
      id: true,
      quizId: true,
      score: true,
      percentage: true,
      passed: true,
      startedAt: true
    }
  });

  /**
   * Jangan kirim answer / isCorrect ke frontend.
   */
  let questions = quiz.questions.map(question => ({
    id: question.id,
    type: question.type,
    title: question.title,
    question: question.question,
    content: question.content,
    points: question.points,
    order: question.order,
    options: question.options.map(option => ({
      id: option.id,
      label: option.label,
      value: option.value,
      order: option.order
    }))
  }));

  /**
   * Shuffle question jika diaktifkan.
   */
  if (quiz.shuffleQuestions) {
    questions = shuffleArray(questions);
  }

  return {
    attempt,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      passingScore: quiz.passingScore,
      xpPerCorrect: quiz.xpPerCorrect,
      timeLimitSeconds: quiz.timeLimitSeconds,
      showExplanation: quiz.showExplanation,
      questionCount: questions.length
    },
    questions
  };
}

/**
 * Fisher-Yates shuffle.
 */
function shuffleArray(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1)
    );

    [result[i], result[randomIndex]] = [
      result[randomIndex],
      result[i]
    ];
  }

  return result;
}

/**
 * =========================================================
 * SUBMIT ANSWER
 * =========================================================
 */

export async function submitQuizAnswer({
  attemptId,
  userId,
  questionId,
  answer
}) {
  if (!userId) {
    throw createServiceError(
      'User tidak ditemukan.',
      401
    );
  }

  const attempt = await prisma.quizAttempt.findFirst({
    where: {
      id: attemptId,
      userId
    },
    select: {
      id: true,
      quizId: true,
      completedAt: true,
      startedAt: true,
      quiz: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          timeLimitSeconds: true
        }
      }
    }
  });

  if (!attempt) {
    throw createServiceError(
      'Percobaan kuis tidak ditemukan.',
      404
    );
  }

  if (attempt.completedAt) {
    throw createServiceError(
      'Percobaan kuis sudah diselesaikan.',
      409
    );
  }

  /**
   * Pastikan quiz masih published.
   */
  if (
    attempt.quiz.status !== 'PUBLISHED' ||
    (
      attempt.quiz.scheduledAt &&
      attempt.quiz.scheduledAt > new Date()
    )
  ) {
    throw createServiceError(
      'Kuis tidak lagi tersedia.',
      403
    );
  }

  /**
   * Cek time limit.
   */
  if (
    Number.isInteger(attempt.quiz.timeLimitSeconds) &&
    attempt.quiz.timeLimitSeconds > 0
  ) {
    const elapsedSeconds =
      (Date.now() - attempt.startedAt.getTime()) / 1000;

    if (
      elapsedSeconds >
      attempt.quiz.timeLimitSeconds
    ) {
      throw createServiceError(
        'Waktu pengerjaan kuis telah habis.',
        408
      );
    }
  }

  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      quizId: attempt.quizId
    },
    select: {
      id: true,
      quizId: true,
      type: true,
      answer: true,
      points: true,
      explanation: true,
      options: {
        select: {
          id: true,
          value: true,
          isCorrect: true
        }
      }
    }
  });

  if (!question) {
    throw createServiceError(
      'Soal tidak ditemukan.',
      404
    );
  }

  const normalizedAnswer = normalizeAnswer(answer);

  if (
    normalizedAnswer === null ||
    normalizedAnswer === ''
  ) {
    throw createServiceError(
      'Jawaban tidak boleh kosong.',
      400
    );
  }

  const correct = evaluateAnswer(
    question,
    normalizedAnswer
  );

  const pointsAwarded = correct
    ? Math.max(0, Number(question.points) || 0)
    : 0;

  /**
   * Upsert membuat endpoint idempotent.
   *
   * Jika user menjawab soal yang sama lagi,
   * jawaban lama akan diperbarui.
   */
  const quizAnswer = await prisma.quizAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId
      }
    },
    create: {
      attemptId,
      questionId,
      answer: normalizedAnswer,
      correct,
      pointsAwarded
    },
    update: {
      answer: normalizedAnswer,
      correct,
      pointsAwarded
    },
    select: {
      id: true,
      attemptId: true,
      questionId: true,
      correct: true,
      pointsAwarded: true,
      createdAt: true
    }
  });

  return {
    id: quizAnswer.id,
    attemptId: quizAnswer.attemptId,
    questionId: quizAnswer.questionId,
    correct: quizAnswer.correct,
    pointsAwarded: quizAnswer.pointsAwarded
  };
}

/**
 * =========================================================
 * COMPLETE ATTEMPT
 * =========================================================
 */

export async function completeQuizAttempt({
  attemptId,
  userId
}) {
  if (!userId) {
    throw createServiceError(
      'User tidak ditemukan.',
      401
    );
  }

  const attempt = await prisma.quizAttempt.findFirst({
    where: {
      id: attemptId,
      userId
    },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          passingScore: true,
          xpPerCorrect: true,
          timeLimitSeconds: true
        }
      },
      answers: {
        select: {
          id: true,
          questionId: true,
          answer: true,
          correct: true,
          pointsAwarded: true
        }
      }
    }
  });

  if (!attempt) {
    throw createServiceError(
      'Percobaan kuis tidak ditemukan.',
      404
    );
  }

  /**
   * Kalau sudah selesai, kembalikan hasil sebelumnya.
   */
  if (attempt.completedAt) {
    return {
      attempt: {
        id: attempt.id,
        quizId: attempt.quizId,
        score: attempt.score,
        percentage: attempt.percentage,
        passed: attempt.passed,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt
      },
      alreadyCompleted: true
    };
  }

  const questionCount = await prisma.question.count({
    where: {
      quizId: attempt.quizId
    }
  });

  if (questionCount === 0) {
    throw createServiceError(
      'Kuis tidak memiliki soal.',
      400
    );
  }

  /**
   * Total poin maksimal.
   */
  const pointsAggregate =
    await prisma.question.aggregate({
      where: {
        quizId: attempt.quizId
      },
      _sum: {
        points: true
      }
    });

  const maxPoints =
    Number(pointsAggregate._sum.points) || 0;

  /**
   * Total poin yang didapat.
   */
  const score = attempt.answers.reduce(
    (total, answer) =>
      total + (Number(answer.pointsAwarded) || 0),
    0
  );

  /**
   * Persentase.
   */
  const percentage = maxPoints > 0
    ? Math.round(
        (score / maxPoints) * 100
      )
    : 0;

  const passed =
    percentage >= attempt.quiz.passingScore;

  const completedAt = new Date();

  const updatedAttempt =
    await prisma.quizAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        score,
        percentage,
        passed,
        completedAt
      },
      select: {
        id: true,
        quizId: true,
        score: true,
        percentage: true,
        passed: true,
        startedAt: true,
        completedAt: true
      }
    });

  /**
   * Hitung jumlah benar dan salah.
   */
  const correctCount =
    attempt.answers.filter(
      answer => answer.correct
    ).length;

  const answeredCount =
    attempt.answers.length;

  const wrongCount =
    answeredCount - correctCount;

  /**
   * XP.
   *
   * XP dihitung berdasarkan jawaban benar.
   */
  const xpEarned =
    correctCount * attempt.quiz.xpPerCorrect;

  return {
    attempt: updatedAttempt,

    result: {
      score,
      maxScore: maxPoints,
      percentage,
      passed,

      correctCount,
      wrongCount,
      answeredCount,
      totalQuestions: questionCount,

      xpEarned
    }
  };
}

/**
 * =========================================================
 * GET ATTEMPT RESULT
 * =========================================================
 */

export async function getQuizAttempt({
  attemptId,
  userId
}) {
  if (!userId) {
    throw createServiceError(
      'User tidak ditemukan.',
      401
    );
  }

  const attempt =
    await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      },
      select: {
        id: true,
        quizId: true,
        score: true,
        percentage: true,
        passed: true,
        startedAt: true,
        completedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            xpPerCorrect: true
          }
        },
        answers: {
          select: {
            id: true,
            questionId: true,
            answer: true,
            correct: true,
            pointsAwarded: true,
            question: {
              select: {
                id: true,
                question: true,
                type: true,
                explanation: true,
                points: true
              }
            }
          }
        }
      }
    });

  if (!attempt) {
    throw createServiceError(
      'Hasil percobaan tidak ditemukan.',
      404
    );
  }

  return attempt;
}