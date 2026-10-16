import { prisma } from '../lib/prisma.js';


// ============================================================
// HELPERS
// ============================================================

function getUserId(req) {
  return req.auth?.userId || req.user?.id || null;
}

function getQuizId(req) {
  return req.params.quizId || null;
}

function getAttemptId(req) {
  return req.params.attemptId || null;
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

function normalizeAnswer(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeAnswer(item))
      .filter(item => item !== null)
      .sort();
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizeAnswer(item)])
    );
  }

  return String(value).trim().toLowerCase();
}

function answersEqual(userAnswer, correctAnswer) {
  const normalizedUserAnswer = normalizeAnswer(userAnswer);
  const normalizedCorrectAnswer = normalizeAnswer(correctAnswer);

  return JSON.stringify(normalizedUserAnswer) === JSON.stringify(normalizedCorrectAnswer);
}

function isAttemptCompleted(attempt) {
  return Boolean(attempt.completedAt);
}

function calculatePercentage(score, totalPoints) {
  if (!totalPoints || totalPoints <= 0) {
    return 0;
  }

  return Math.round((score / totalPoints) * 100);
}

function getTotalPoints(questions) {
  return questions.reduce(
    (total, question) => total + Math.max(0, question.points || 0),
    0
  );
}


// ============================================================
// START QUIZ ATTEMPT
// POST /api/quizzes/:quizId/attempts
// ============================================================

export async function startQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const quizId = getQuizId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: 'Quiz ID wajib diisi.'
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
            title: true,
            question: true,
            type: true,
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
      return res.status(404).json({
        success: false,
        message: 'Kuis tidak ditemukan atau belum dipublikasikan.'
      });
    }

    if (!quiz.questions.length) {
      return res.status(400).json({
        success: false,
        message: 'Kuis belum memiliki pertanyaan.'
      });
    }

    if (quiz.maxAttempts !== null) {
      const completedAttempts = await prisma.quizAttempt.count({
        where: {
          userId,
          quizId,
          completedAt: {
            not: null
          }
        }
      });

      if (completedAttempts >= quiz.maxAttempts) {
        return res.status(403).json({
          success: false,
          message: 'Batas percobaan kuis telah tercapai.'
        });
      }
    }

    const activeAttempt = await prisma.quizAttempt.findFirst({
      where: {
        userId,
        quizId,
        completedAt: null
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    if (activeAttempt) {
      return res.status(200).json({
        success: true,
        message: 'Anda masih memiliki percobaan kuis yang aktif.',
        data: {
          attempt: {
            id: activeAttempt.id,
            quizId: activeAttempt.quizId,
            startedAt: activeAttempt.startedAt,
            completedAt: activeAttempt.completedAt
          }
        }
      });
    }

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
        userId: true,
        quizId: true,
        score: true,
        percentage: true,
        passed: true,
        startedAt: true,
        completedAt: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Percobaan kuis berhasil dimulai.',
      data: {
        attempt,
        quiz: {
          id: quiz.id,
          materialId: quiz.materialId,
          title: quiz.title,
          description: quiz.description,
          passingScore: quiz.passingScore,
          xpPerCorrect: quiz.xpPerCorrect,
          maxAttempts: quiz.maxAttempts,
          timeLimitSeconds: quiz.timeLimitSeconds,
          shuffleQuestions: quiz.shuffleQuestions,
          showExplanation: quiz.showExplanation,
          questions: quiz.questions
        }
      }
    });
  } catch (error) {
    console.error('startQuizAttemptController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memulai percobaan kuis.'
    });
  }
}


// ============================================================
// SUBMIT QUIZ ANSWER
// POST /api/quizzes/attempts/:attemptId/answers
// ============================================================

export async function submitQuizAnswerController(req, res) {
  try {
    const userId = getUserId(req);
    const attemptId = getAttemptId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'Attempt ID wajib diisi.'
      });
    }

    const { questionId, answer } = req.body || {};

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: 'Question ID wajib diisi.'
      });
    }

    if (answer === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Jawaban wajib diisi.'
      });
    }

    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      },
      select: {
        id: true,
        userId: true,
        quizId: true,
        startedAt: true,
        completedAt: true,
        quiz: {
          select: {
            id: true,
            timeLimitSeconds: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Percobaan kuis tidak ditemukan.'
      });
    }

    if (isAttemptCompleted(attempt)) {
      return res.status(400).json({
        success: false,
        message: 'Percobaan kuis sudah diselesaikan.'
      });
    }

    if (
      attempt.quiz.timeLimitSeconds !== null &&
      attempt.quiz.timeLimitSeconds > 0
    ) {
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
      );

      if (elapsedSeconds >= attempt.quiz.timeLimitSeconds) {
        return res.status(400).json({
          success: false,
          message: 'Waktu pengerjaan kuis telah habis.'
        });
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
        answer: true,
        points: true
      }
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Pertanyaan tidak ditemukan pada kuis ini.'
      });
    }

    const correct = answersEqual(
      answer,
      question.answer
    );

    const pointsAwarded = correct
      ? Math.max(0, question.points || 0)
      : 0;

    const quizAnswer = await prisma.quizAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId
        }
      },
      update: {
        answer,
        correct,
        pointsAwarded
      },
      create: {
        attemptId,
        questionId,
        answer,
        correct,
        pointsAwarded
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        answer: true,
        correct: true,
        pointsAwarded: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Jawaban berhasil disimpan.',
      data: {
        answer: {
          id: quizAnswer.id,
          attemptId: quizAnswer.attemptId,
          questionId: quizAnswer.questionId,
          correct: quizAnswer.correct,
          pointsAwarded: quizAnswer.pointsAwarded,
          createdAt: quizAnswer.createdAt
        }
      }
    });
  } catch (error) {
    console.error('submitQuizAnswerController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan jawaban kuis.'
    });
  }
}


// ============================================================
// COMPLETE QUIZ ATTEMPT
// POST /api/quizzes/attempts/:attemptId/complete
// ============================================================

export async function completeQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const attemptId = getAttemptId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'Attempt ID wajib diisi.'
      });
    }

    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      },
      select: {
        id: true,
        userId: true,
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
            xpPerCorrect: true,
            timeLimitSeconds: true,
            showExplanation: true
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
      return res.status(404).json({
        success: false,
        message: 'Percobaan kuis tidak ditemukan.'
      });
    }

    if (attempt.completedAt) {
      return res.status(200).json({
        success: true,
        message: 'Percobaan kuis sudah diselesaikan sebelumnya.',
        data: {
          attempt: {
            id: attempt.id,
            quizId: attempt.quizId,
            score: attempt.score,
            percentage: attempt.percentage,
            passed: attempt.passed,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt
          }
        }
      });
    }

    const questions = await prisma.question.findMany({
      where: {
        quizId: attempt.quizId
      },
      select: {
        id: true,
        points: true
      }
    });

    const totalPoints = getTotalPoints(questions);

    const score = attempt.answers.reduce(
      (total, item) => total + Math.max(0, item.pointsAwarded || 0),
      0
    );

    const percentage = calculatePercentage(
      score,
      totalPoints
    );

    const passed = percentage >= attempt.quiz.passingScore;

    const completedAt = new Date();

    const completedAttempt = await prisma.quizAttempt.update({
      where: {
        id: attempt.id
      },
      data: {
        score,
        percentage,
        passed,
        completedAt
      },
      select: {
        id: true,
        userId: true,
        quizId: true,
        score: true,
        percentage: true,
        passed: true,
        startedAt: true,
        completedAt: true
      }
    });

    const correctCount = attempt.answers.filter(
      answer => answer.correct
    ).length;

    const answeredCount = attempt.answers.length;

    const totalQuestions = questions.length;

    const xpEarned = correctCount * attempt.quiz.xpPerCorrect;

    return res.status(200).json({
      success: true,
      message: passed
        ? 'Selamat! Kuis berhasil diselesaikan.'
        : 'Kuis selesai. Tetap semangat untuk belajar lagi.',
      data: {
        attempt: completedAttempt,
        result: {
          score,
          percentage,
          passed,
          correctCount,
          answeredCount,
          totalQuestions,
          totalPoints,
          xpEarned
        }
      }
    });
  } catch (error) {
    console.error('completeQuizAttemptController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan percobaan kuis.'
    });
  }
}


// ============================================================
// GET QUIZ ATTEMPT
// GET /api/quizzes/attempts/:attemptId
// ============================================================

export async function getQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const attemptId = getAttemptId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'Attempt ID wajib diisi.'
      });
    }

    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      },
      select: {
        id: true,
        userId: true,
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
            description: true,
            passingScore: true,
            xpPerCorrect: true,
            timeLimitSeconds: true,
            showExplanation: true
          }
        },
        answers: {
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            id: true,
            questionId: true,
            answer: true,
            correct: true,
            pointsAwarded: true,
            createdAt: true,
            question: {
              select: {
                id: true,
                title: true,
                question: true,
                type: true,
                content: true,
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
                    order: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Percobaan kuis tidak ditemukan.'
      });
    }

    const data = {
      id: attempt.id,
      userId: attempt.userId,
      quizId: attempt.quizId,
      score: attempt.score,
      percentage: attempt.percentage,
      passed: attempt.passed,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      quiz: attempt.quiz,
      answers: attempt.answers
    };

    return res.status(200).json({
      success: true,
      data: {
        attempt: data
      }
    });
  } catch (error) {
    console.error('getQuizAttemptController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data percobaan kuis.'
    });
  }
}