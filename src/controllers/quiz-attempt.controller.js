import { prisma } from '../lib/prisma.js';

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function getUserId(req) {
  return req.auth?.userId || req.user?.id || null;
}

function getPaginationSafeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeAnswer(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeAnswer);
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

function normalizeComparable(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (Array.isArray(value)) {
    return value
      .map(normalizeComparable)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeComparable(value[key]);
        return result;
      }, {});
  }

  return value;
}

function answersMatch(userAnswer, correctAnswer) {
  const normalizedUser = normalizeComparable(userAnswer);
  const normalizedCorrect = normalizeComparable(correctAnswer);

  return JSON.stringify(normalizedUser) === JSON.stringify(
    normalizedCorrect
  );
}

function extractCorrectAnswer(question) {
  /**
   * Primary source:
   * Question.answer
   *
   * Fallback:
   * QuestionOption.isCorrect
   *
   * Hal ini membuat controller tetap fleksibel terhadap
   * tipe soal yang berbeda.
   */

  if (
    question.answer !== undefined &&
    question.answer !== null
  ) {
    return question.answer;
  }

  if (Array.isArray(question.options)) {
    const correctOptions = question.options
      .filter(option => option.isCorrect)
      .map(option => option.value);

    if (correctOptions.length === 1) {
      return correctOptions[0];
    }

    if (correctOptions.length > 1) {
      return correctOptions;
    }
  }

  return null;
}

function calculateScore(answers) {
  return answers.reduce(
    (total, answer) => total + (answer.pointsAwarded || 0),
    0
  );
}

function calculatePercentage(score, maxScore) {
  if (!maxScore || maxScore <= 0) {
    return 0;
  }

  return Math.round((score / maxScore) * 100);
}

function calculateMaxScore(questions) {
  return questions.reduce(
    (total, question) => total + Math.max(0, question.points || 0),
    0
  );
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

function getAttemptResult(attempt, quiz, questions = []) {
  const maxScore = calculateMaxScore(questions);

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    score: attempt.score,
    percentage: attempt.percentage,
    passed: attempt.passed,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    maxScore,
    passingScore: quiz.passingScore,
    xpEarned: attempt.answers?.reduce(
      (total, answer) => total + (
        answer.correct ? quiz.xpPerCorrect : 0
      ),
      0
    ) || 0
  };
}

/**
 * ============================================================
 * START ATTEMPT
 * POST /api/quizzes/:quizId/attempts
 * ============================================================
 */

export async function startQuizAttempt(req, res) {
  try {
    const userId = getUserId(req);
    const { quizId } = req.params;

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
            type: true,
            title: true,
            question: true,
            content: true,
            points: true,
            order: true,
            answer: true,
            options: {
              orderBy: {
                order: 'asc'
              },
              select: {
                id: true,
                label: true,
                value: true,
                order: true,
                isCorrect: true
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

    /**
     * Cek jumlah attempt yang sudah selesai.
     *
     * Attempt yang belum selesai tidak dihitung sebagai
     * completed attempt.
     */
    if (
      quiz.maxAttempts !== null &&
      quiz.maxAttempts !== undefined
    ) {
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
        return res.status(409).json({
          success: false,
          message: `Batas percobaan kuis sudah tercapai (${quiz.maxAttempts} kali).`,
          data: {
            maxAttempts: quiz.maxAttempts,
            attemptsUsed: completedAttempts
          }
        });
      }
    }

    /**
     * Kalau user punya attempt yang belum selesai,
     * gunakan kembali attempt tersebut.
     *
     * Ini mencegah satu user membuat banyak attempt
     * hanya karena refresh halaman.
     */
    let attempt = await prisma.quizAttempt.findFirst({
      where: {
        userId,
        quizId,
        completedAt: null
      },
      orderBy: {
        startedAt: 'desc'
      },
      include: {
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
      attempt = await prisma.quizAttempt.create({
        data: {
          userId,
          quizId,
          score: 0,
          percentage: 0,
          passed: false
        },
        include: {
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
    }

    /**
     * Jangan kirim Question.answer atau isCorrect
     * ke browser.
     */
    let questions = quiz.questions.map(sanitizeQuestion);

    /**
     * Shuffle dilakukan berdasarkan konfigurasi quiz.
     *
     * Urutan aktual tidak mengubah order database.
     */
    if (quiz.shuffleQuestions) {
      questions = [...questions].sort(
        () => Math.random() - 0.5
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Attempt kuis berhasil dimulai.',
      data: {
        attempt: {
          id: attempt.id,
          quizId: attempt.quizId,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
          score: attempt.score,
          percentage: attempt.percentage,
          passed: attempt.passed
        },

        quiz: {
          id: quiz.id,
          materialId: quiz.materialId,
          title: quiz.title,
          description: quiz.description,
          passingScore: quiz.passingScore,
          xpPerCorrect: quiz.xpPerCorrect,
          maxAttempts: quiz.maxAttempts,
          timeLimitSeconds: quiz.timeLimitSeconds,
          showExplanation: quiz.showExplanation
        },

        questions,

        /**
         * Jawaban yang sudah tersimpan dikirim supaya
         * frontend dapat melanjutkan attempt setelah refresh.
         *
         * Tidak ada correct answer di sini.
         */
        answered: attempt.answers.map(answer => ({
          questionId: answer.questionId,
          answer: answer.answer
        }))
      }
    });
  } catch (error) {
    console.error('startQuizAttempt:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memulai kuis.'
    });
  }
}

/**
 * ============================================================
 * SUBMIT ANSWER
 * POST /api/quizzes/attempts/:attemptId/answers
 * ============================================================
 */

export async function submitQuizAnswer(req, res) {
  try {
    const userId = getUserId(req);
    const { attemptId } = req.params;

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

    const questionId =
      req.body?.questionId ||
      req.body?.question_id;

    const userAnswer =
      req.body?.answer ??
      req.body?.value ??
      req.body?.selectedAnswer;

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: 'Question ID wajib diisi.'
      });
    }

    if (userAnswer === undefined || userAnswer === null) {
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
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            xpPerCorrect: true,
            timeLimitSeconds: true,
            showExplanation: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Attempt kuis tidak ditemukan.'
      });
    }

    if (attempt.completedAt) {
      return res.status(409).json({
        success: false,
        message: 'Kuis sudah diselesaikan.'
      });
    }

    /**
     * Time limit.
     */
    if (attempt.quiz.timeLimitSeconds) {
      const elapsedSeconds = Math.floor(
        (Date.now() - attempt.startedAt.getTime()) / 1000
      );

      if (
        elapsedSeconds >
        attempt.quiz.timeLimitSeconds
      ) {
        return res.status(409).json({
          success: false,
          message: 'Waktu pengerjaan kuis telah habis.',
          data: {
            timeLimitSeconds: attempt.quiz.timeLimitSeconds,
            elapsedSeconds
          }
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
        type: true,
        question: true,
        answer: true,
        points: true,
        explanation: true,
        options: {
          orderBy: {
            order: 'asc'
          },
          select: {
            id: true,
            value: true,
            isCorrect: true
          }
        }
      }
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Pertanyaan tidak ditemukan dalam kuis ini.'
      });
    }

    const normalizedAnswer = normalizeAnswer(userAnswer);

    const correctAnswer =
      extractCorrectAnswer(question);

    const correct =
      correctAnswer !== null &&
      answersMatch(
        normalizedAnswer,
        correctAnswer
      );

    const pointsAwarded =
      correct
        ? Math.max(0, question.points || 0)
        : 0;

    /**
     * Upsert karena schema mempunyai:
     *
     * @@unique([attemptId, questionId])
     */
    const savedAnswer =
      await prisma.quizAnswer.upsert({
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
          answer: true,
          correct: true,
          pointsAwarded: true
        }
      });

    /**
     * Hitung ulang score berdasarkan seluruh jawaban.
     */
    const allAnswers = await prisma.quizAnswer.findMany({
      where: {
        attemptId
      },
      select: {
        pointsAwarded: true
      }
    });

    const score = calculateScore(allAnswers);

    const quizQuestions = await prisma.question.findMany({
      where: {
        quizId: attempt.quizId
      },
      select: {
        points: true
      }
    });

    const maxScore =
      calculateMaxScore(quizQuestions);

    const percentage =
      calculatePercentage(score, maxScore);

    await prisma.quizAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        score,
        percentage,
        passed: percentage >= attempt.quiz.passingScore
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Jawaban berhasil disimpan.',
      data: {
        answer: {
          id: savedAnswer.id,
          attemptId: savedAnswer.attemptId,
          questionId: savedAnswer.questionId,
          answer: savedAnswer.answer
        },

        /**
         * Boleh memberi tahu benar/salah setelah jawaban
         * disimpan. Ini berguna untuk mode belajar adaptif.
         */
        evaluation: {
          correct,
          pointsAwarded
        },

        progress: {
          answered: allAnswers.length,
          total: quizQuestions.length,
          score,
          maxScore,
          percentage
        }
      }
    });
  } catch (error) {
    console.error('submitQuizAnswer:', error);

    if (error?.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Attempt atau jawaban tidak ditemukan.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan jawaban.'
    });
  }
}

/**
 * ============================================================
 * COMPLETE ATTEMPT
 * POST /api/quizzes/attempts/:attemptId/complete
 * ============================================================
 */

export async function completeQuizAttempt(req, res) {
  try {
    const userId = getUserId(req);
    const { attemptId } = req.params;

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
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            xpPerCorrect: true,
            maxAttempts: true,
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
            pointsAwarded: true,
            createdAt: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: 'Attempt kuis tidak ditemukan.'
      });
    }

    /**
     * Idempotent:
     * kalau frontend mengirim complete dua kali,
     * jangan membuat hasil berbeda.
     */
    if (attempt.completedAt) {
      const questions = await prisma.question.findMany({
        where: {
          quizId: attempt.quizId
        },
        select: {
          id: true,
          points: true,
          explanation: true,
          answer: true
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Attempt sudah diselesaikan sebelumnya.',
        data: {
          attempt: getAttemptResult(
            attempt,
            attempt.quiz,
            questions
          )
        }
      });
    }

    /**
     * Ambil semua pertanyaan untuk menentukan max score.
     */
    const questions = await prisma.question.findMany({
      where: {
        quizId: attempt.quizId
      },
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
    });

    if (!questions.length) {
      return res.status(400).json({
        success: false,
        message: 'Kuis tidak memiliki pertanyaan.'
      });
    }

    /**
     * Hitung ulang seluruh jawaban di server.
     *
     * Jangan mempercayai score dari frontend.
     */
    const questionMap = new Map(
      questions.map(question => [
        question.id,
        question
      ])
    );

    let score = 0;

    const evaluatedAnswers = attempt.answers.map(answer => {
      const question =
        questionMap.get(answer.questionId);

      if (!question) {
        return {
          ...answer,
          correct: false,
          pointsAwarded: 0
        };
      }

      const correctAnswer =
        extractCorrectAnswer(question);

      const correct =
        correctAnswer !== null &&
        answersMatch(
          answer.answer,
          correctAnswer
        );

      const pointsAwarded =
        correct
          ? Math.max(0, question.points || 0)
          : 0;

      score += pointsAwarded;

      return {
        ...answer,
        correct,
        pointsAwarded
      };
    });

    /**
     * Pertanyaan yang belum dijawab mendapatkan 0.
     */
    const answeredQuestionIds =
      new Set(
        attempt.answers.map(
          answer => answer.questionId
        )
      );

    for (const question of questions) {
      if (!answeredQuestionIds.has(question.id)) {
        evaluatedAnswers.push({
          id: null,
          questionId: question.id,
          answer: null,
          correct: false,
          pointsAwarded: 0
        });
      }
    }

    const maxScore =
      calculateMaxScore(questions);

    const percentage =
      calculatePercentage(
        score,
        maxScore
      );

    const passed =
      percentage >= attempt.quiz.passingScore;

    /**
     * Update seluruh QuizAnswer sekaligus.
     */
    await prisma.$transaction(async transaction => {
      for (const answer of evaluatedAnswers) {
        if (!answer.id) {
          continue;
        }

        await transaction.quizAnswer.update({
          where: {
            id: answer.id
          },
          data: {
            correct: answer.correct,
            pointsAwarded: answer.pointsAwarded
          }
        });
      }

      await transaction.quizAttempt.update({
        where: {
          id: attempt.id
        },
        data: {
          score,
          percentage,
          passed,
          completedAt: new Date()
        }
      });
    });

    /**
     * XP dihitung dari jawaban benar.
     */
    const correctCount =
      evaluatedAnswers.filter(
        answer => answer.correct
      ).length;

    const xpEarned =
      correctCount *
      attempt.quiz.xpPerCorrect;

    /**
     * Feedback sederhana untuk pembelajaran adaptif.
     */
    let learningStatus = 'NEEDS_SUPPORT';

    if (percentage >= 90) {
      learningStatus = 'MASTERED';
    } else if (percentage >= attempt.quiz.passingScore) {
      learningStatus = 'DEVELOPING';
    }

    /**
     * Explanation hanya dikirim setelah selesai,
     * dan hanya jika konfigurasi quiz mengizinkannya.
     */
    const explanations =
      attempt.quiz.showExplanation
        ? questions.map(question => {
            const answer =
              evaluatedAnswers.find(
                item =>
                  item.questionId === question.id
              );

            return {
              questionId: question.id,
              explanation: question.explanation,
              correct: answer?.correct ?? false,
              pointsAwarded:
                answer?.pointsAwarded ?? 0
            };
          })
        : [];

    return res.status(200).json({
      success: true,
      message: passed
        ? 'Selamat, kamu berhasil menyelesaikan kuis.'
        : 'Kuis selesai. Yuk pelajari kembali materi yang masih perlu diperkuat.',

      data: {
        attempt: {
          id: attempt.id,
          quizId: attempt.quizId,
          score,
          maxScore,
          percentage,
          passed,
          passingScore: attempt.quiz.passingScore,
          startedAt: attempt.startedAt,
          completedAt: new Date()
        },

        result: {
          correctCount,
          answeredCount: attempt.answers.length,
          totalQuestions: questions.length,
          xpEarned,
          learningStatus
        },

        explanations
      }
    });
  } catch (error) {
    console.error('completeQuizAttempt:', error);

    if (error?.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Attempt tidak ditemukan.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan kuis.'
    });
  }
}