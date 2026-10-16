import { prisma } from '../lib/prisma.js';


// ============================================================
// HELPERS
// ============================================================

function getUserId(req) {
  return req.auth?.userId || req.user?.id || null;
}


function isQuizAvailable(quiz) {
  if (!quiz) {
    return false;
  }

  if (quiz.status !== 'PUBLISHED') {
    return false;
  }

  if (quiz.scheduledAt && new Date(quiz.scheduledAt) > new Date()) {
    return false;
  }

  return true;
}


function normalizeAnswer(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(normalizeAnswer)
      .sort((a, b) => String(a).localeCompare(String(b)));
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizeAnswer(value[key]);
        return result;
      }, {});
  }

  return value;
}


function answersEqual(left, right) {
  const normalizedLeft = normalizeAnswer(left);
  const normalizedRight = normalizeAnswer(right);

  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}


function parseAnswer(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}


function serializeQuestion(question) {
  return {
    id: question.id,
    title: question.title,
    question: question.question,
    type: question.type,
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


function serializeAttempt(attempt) {
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    userId: attempt.userId,
    score: attempt.score,
    percentage: attempt.percentage,
    passed: attempt.passed,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt
  };
}


function getAttemptStatus(attempt) {
  if (attempt.completedAt) {
    return 'COMPLETED';
  }

  return 'IN_PROGRESS';
}


function getElapsedSeconds(attempt) {
  return Math.floor(
    (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
  );
}


function isTimeExpired(attempt, quiz) {
  if (!quiz?.timeLimitSeconds) {
    return false;
  }

  return getElapsedSeconds(attempt) >= quiz.timeLimitSeconds;
}


function calculatePercentage(score, totalPoints) {
  if (!totalPoints || totalPoints <= 0) {
    return 0;
  }

  return Math.round((score / totalPoints) * 100);
}


// ============================================================
// ANSWER EVALUATION
// ============================================================

function evaluateAnswer(question, submittedAnswer) {
  const answer = parseAnswer(submittedAnswer);

  // ----------------------------------------------------------
  // Pilihan ganda
  // ----------------------------------------------------------

  if (
    question.type === 'MULTIPLE_CHOICE' ||
    question.type === 'SINGLE_CHOICE' ||
    question.type === 'TRUE_FALSE'
  ) {
    const correctOption = question.options?.find(
      option => option.isCorrect
    );

    if (!correctOption) {
      return false;
    }

    return answersEqual(answer, correctOption.value);
  }


  // ----------------------------------------------------------
  // Multiple answer
  // ----------------------------------------------------------

  if (
    question.type === 'MULTIPLE_SELECT' ||
    question.type === 'MULTIPLE_CHOICE_MULTIPLE'
  ) {
    const correctOptions = (question.options || [])
      .filter(option => option.isCorrect)
      .map(option => option.value);

    const submittedOptions = Array.isArray(answer)
      ? answer
      : [answer];

    return answersEqual(
      submittedOptions,
      correctOptions
    );
  }


  // ----------------------------------------------------------
  // Question type dengan answer JSON
  // ----------------------------------------------------------

  return answersEqual(
    answer,
    question.answer
  );
}


// ============================================================
// START QUIZ ATTEMPT
// POST /api/quizzes/:quizId/attempts
// ============================================================

export async function startQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const { quizId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: 'quizId wajib diisi.'
      });
    }


    // --------------------------------------------------------
    // Ambil quiz
    // --------------------------------------------------------

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        materialId: true,
        title: true,
        description: true,
        passingScore: true,
        xpPerCorrect: true,
        maxAttempts: true,
        timeLimitSeconds: true,
        status: true,
        scheduledAt: true,
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


    if (!quiz || !isQuizAvailable(quiz)) {
      return res.status(404).json({
        success: false,
        message: 'Kuis tidak ditemukan atau belum tersedia.'
      });
    }


    // --------------------------------------------------------
    // Quiz harus memiliki soal
    // --------------------------------------------------------

    if (!quiz.questions.length) {
      return res.status(400).json({
        success: false,
        message: 'Kuis belum memiliki soal.'
      });
    }


    // --------------------------------------------------------
    // Cek attempt yang masih aktif
    // --------------------------------------------------------

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
      if (!isTimeExpired(activeAttempt, quiz)) {
        return res.status(200).json({
          success: true,
          message: 'Anda masih memiliki percobaan kuis yang aktif.',
          data: {
            attempt: serializeAttempt(activeAttempt)
          }
        });
      }

      // Jika waktu sudah habis, tandai selesai.
      const expiredAttempt = await completeAttempt(
        activeAttempt.id,
        userId
      );

      return res.status(200).json({
        success: true,
        message: 'Percobaan sebelumnya telah berakhir karena batas waktu.',
        data: {
          attempt: serializeAttempt(expiredAttempt)
        }
      });
    }


    // --------------------------------------------------------
    // Cek maksimal percobaan
    // --------------------------------------------------------

    if (quiz.maxAttempts !== null && quiz.maxAttempts !== undefined) {
      const attemptCount = await prisma.quizAttempt.count({
        where: {
          userId,
          quizId
        }
      });

      if (attemptCount >= quiz.maxAttempts) {
        return res.status(403).json({
          success: false,
          message: 'Batas percobaan kuis Anda telah habis.'
        });
      }
    }


    // --------------------------------------------------------
    // Buat attempt
    // --------------------------------------------------------

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId,
        quizId,
        score: 0,
        percentage: 0,
        passed: false
      }
    });


    // --------------------------------------------------------
    // Soal untuk frontend
    // Tidak pernah mengirim answer / isCorrect.
    // --------------------------------------------------------

    const questions = quiz.questions.map(serializeQuestion);


    return res.status(201).json({
      success: true,
      message: 'Percobaan kuis berhasil dimulai.',
      data: {
        attempt: serializeAttempt(attempt),
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
          questionCount: questions.length,
          questions
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
// SUBMIT ANSWER
// POST /api/quizzes/attempts/:attemptId/answers
// ============================================================

export async function submitQuizAnswerController(req, res) {
  try {
    const userId = getUserId(req);
    const { attemptId } = req.params;

    const {
      questionId,
      answer
    } = req.body || {};


    // --------------------------------------------------------
    // Validasi auth
    // --------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }


    // --------------------------------------------------------
    // Validasi body
    // --------------------------------------------------------

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'attemptId wajib diisi.'
      });
    }

    if (!questionId) {
      return res.status(400).json({
        success: false,
        message: 'questionId wajib diisi.'
      });
    }

    if (answer === undefined) {
      return res.status(400).json({
        success: false,
        message: 'answer wajib diisi.'
      });
    }


    // --------------------------------------------------------
    // Ambil attempt
    // --------------------------------------------------------

    const attempt = await prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId
      },
      include: {
        quiz: {
          select: {
            id: true,
            passingScore: true,
            timeLimitSeconds: true,
            status: true,
            scheduledAt: true
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


    // --------------------------------------------------------
    // Attempt sudah selesai
    // --------------------------------------------------------

    if (attempt.completedAt) {
      return res.status(409).json({
        success: false,
        message: 'Percobaan kuis sudah selesai.'
      });
    }


    // --------------------------------------------------------
    // Cek waktu
    // --------------------------------------------------------

    if (isTimeExpired(attempt, attempt.quiz)) {
      const expiredAttempt = await completeAttempt(
        attempt.id,
        userId
      );

      return res.status(410).json({
        success: false,
        message: 'Waktu pengerjaan kuis telah habis.',
        data: {
          attempt: serializeAttempt(expiredAttempt)
        }
      });
    }


    // --------------------------------------------------------
    // Ambil question
    // --------------------------------------------------------

    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        quizId: attempt.quizId
      },
      include: {
        options: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    });


    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Soal tidak ditemukan dalam kuis ini.'
      });
    }


    // --------------------------------------------------------
    // Evaluasi jawaban
    // --------------------------------------------------------

    const isCorrect = evaluateAnswer(
      question,
      answer
    );

    const pointsAwarded = isCorrect
      ? Math.max(0, Number(question.points) || 0)
      : 0;


    // --------------------------------------------------------
    // Simpan / update jawaban
    // --------------------------------------------------------

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
        answer: parseAnswer(answer),
        correct: isCorrect,
        pointsAwarded
      },
      update: {
        answer: parseAnswer(answer),
        correct: isCorrect,
        pointsAwarded
      }
    });


    // --------------------------------------------------------
    // Hitung progress
    // --------------------------------------------------------

    const [answeredCount, questionCount] =
      await prisma.$transaction([
        prisma.quizAnswer.count({
          where: {
            attemptId
          }
        }),

        prisma.question.count({
          where: {
            quizId: attempt.quizId
          }
        })
      ]);


    return res.status(200).json({
      success: true,
      message: 'Jawaban berhasil disimpan.',
      data: {
        answer: {
          id: quizAnswer.id,
          attemptId: quizAnswer.attemptId,
          questionId: quizAnswer.questionId
        },
        progress: {
          answered: answeredCount,
          total: questionCount,
          percentage: questionCount > 0
            ? Math.round((answeredCount / questionCount) * 100)
            : 0
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
// COMPLETE ATTEMPT
// POST /api/quizzes/attempts/:attemptId/complete
// ============================================================

export async function completeQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const { attemptId } = req.params;


    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }


    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'attemptId wajib diisi.'
      });
    }


    // --------------------------------------------------------
    // Cari attempt
    // --------------------------------------------------------

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
        message: 'Percobaan kuis tidak ditemukan.'
      });
    }


    // --------------------------------------------------------
    // Jika sudah selesai, kembalikan hasil yang sudah ada
    // --------------------------------------------------------

    if (attempt.completedAt) {
      return getCompletedAttemptResponse(
        res,
        attempt.id,
        userId
      );
    }


    const completedAttempt = await completeAttempt(
      attemptId,
      userId
    );


    return getCompletedAttemptResponse(
      res,
      completedAttempt.id,
      userId
    );
  } catch (error) {
    console.error('completeQuizAttemptController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan kuis.'
    });
  }
}


// ============================================================
// GET ATTEMPT RESULT
// GET /api/quizzes/attempts/:attemptId
// ============================================================

export async function getQuizAttemptController(req, res) {
  try {
    const userId = getUserId(req);
    const { attemptId } = req.params;


    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }


    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: 'attemptId wajib diisi.'
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
                points: true,
                explanation: true
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


    const answers = attempt.answers.map(item => ({
      id: item.id,
      questionId: item.questionId,
      answer: item.answer,
      correct: item.correct,
      pointsAwarded: item.pointsAwarded,
      createdAt: item.createdAt,
      question: {
        id: item.question.id,
        title: item.question.title,
        question: item.question.question,
        type: item.question.type,
        points: item.question.points,
        explanation: attempt.quiz.showExplanation
          ? item.question.explanation
          : null
      }
    }));


    return res.status(200).json({
      success: true,
      data: {
        attempt: {
          ...serializeAttempt(attempt),
          status: getAttemptStatus(attempt)
        },
        quiz: attempt.quiz,
        answers
      }
    });
  } catch (error) {
    console.error('getQuizAttemptController:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil hasil percobaan kuis.'
    });
  }
}


// ============================================================
// INTERNAL: COMPLETE ATTEMPT
// ============================================================

async function completeAttempt(attemptId, userId) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: {
      id: attemptId,
      userId
    },
    include: {
      quiz: {
        select: {
          id: true,
          passingScore: true,
          xpPerCorrect: true
        }
      },
      answers: {
        select: {
          pointsAwarded: true
        }
      }
    }
  });


  if (!attempt) {
    throw new Error('Attempt not found');
  }


  if (attempt.completedAt) {
    return attempt;
  }


  // ----------------------------------------------------------
  // Hitung score
  // ----------------------------------------------------------

  const score = attempt.answers.reduce(
    (total, answer) => total + (answer.pointsAwarded || 0),
    0
  );


  // ----------------------------------------------------------
  // Total point seluruh soal
  // ----------------------------------------------------------

  const totalPoints = await prisma.question.aggregate({
    where: {
      quizId: attempt.quizId
    },
    _sum: {
      points: true
    }
  });


  const maximumPoints = totalPoints._sum.points || 0;

  const percentage = calculatePercentage(
    score,
    maximumPoints
  );


  const passed = percentage >= attempt.quiz.passingScore;


  // ----------------------------------------------------------
  // Update attempt
  // ----------------------------------------------------------

  return prisma.quizAttempt.update({
    where: {
      id: attemptId
    },
    data: {
      score,
      percentage,
      passed,
      completedAt: new Date()
    }
  });
}


// ============================================================
// INTERNAL: COMPLETED RESPONSE
// ============================================================

async function getCompletedAttemptResponse(
  res,
  attemptId,
  userId
) {
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
              points: true,
              explanation: true
            }
          }
        }
      }
    }
  });


  if (!attempt) {
    return res.status(404).json({
      success: false,
      message: 'Hasil percobaan kuis tidak ditemukan.'
    });
  }


  const answers = attempt.answers.map(item => ({
    id: item.id,
    questionId: item.questionId,
    answer: item.answer,
    correct: item.correct,
    pointsAwarded: item.pointsAwarded,
    createdAt: item.createdAt,
    question: {
      id: item.question.id,
      title: item.question.title,
      question: item.question.question,
      type: item.question.type,
      points: item.question.points,
      explanation: attempt.quiz.showExplanation
        ? item.question.explanation
        : null
    }
  }));


  return res.status(200).json({
    success: true,
    data: {
      attempt: {
        ...serializeAttempt(attempt),
        status: 'COMPLETED'
      },
      quiz: attempt.quiz,
      answers
    }
  });
}