import { prisma } from '../lib/prisma.js';

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

function getUserId(req) {
  return req.user?.id ?? req.auth?.userId ?? null;
}

function parseJson(value) {
  if (typeof value !== 'string') return value ?? {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeType(value) {
  const type = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (
    [
      'CHOICE',
      'SINGLE_CHOICE',
      'SINGLE_SELECT',
      'MULTIPLE_CHOICE',
      'MULTI_SELECT'
    ].includes(type)
  ) {
    return 'choice';
  }

  if (['TRUE_FALSE', 'TRUEFALSE', 'BOOLEAN'].includes(type)) {
    return 'true_false';
  }

  if (
    ['ORDERING', 'ORDER', 'SEQUENCE', 'SEQUENCING'].includes(type)
  ) {
    return 'ordering';
  }

  if (
    ['MATCHING', 'MATCH', 'PAIRING'].includes(type)
  ) {
    return 'matching';
  }

  if (
    ['CASE', 'CASE_ANALYSIS', 'CASE_STUDY'].includes(type)
  ) {
    return 'case_analysis';
  }

  return type.toLowerCase();
}

function unwrapToken(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return value;
  }

  return (
    value.value ??
    value.id ??
    value.optionId ??
    value.index ??
    value.answer ??
    value.label ??
    value.text ??
    value.title ??
    value.leftIndex ??
    value.rightIndex ??
    value
  );
}

function tokenString(value) {
  const unwrapped = unwrapToken(value);

  if (unwrapped === undefined || unwrapped === null) {
    return '';
  }

  return String(unwrapped).trim().toLowerCase();
}

function sameToken(first, second) {
  const a = tokenString(first);
  const b = tokenString(second);

  return Boolean(a && b && a === b);
}

function optionCandidates(option, index) {
  return [
    option?.value,
    option?.id,
    option?.label,
    option?.text,
    String(index),
    index,
    String.fromCharCode(65 + index)
  ].filter(
    value => value !== undefined && value !== null
  );
}

function findSelectedOption(question, submitted) {
  const options = asArray(question.options);

  if (!options.length) {
    return {
      option: null,
      index: -1
    };
  }

  const payload =
    submitted &&
    typeof submitted === 'object' &&
    !Array.isArray(submitted)
      ? submitted
      : {
          value: submitted
        };

  const selectedValue =
    payload.selectedValue ??
    payload.optionValue ??
    payload.optionId ??
    payload.value;

  if (
    selectedValue !== undefined &&
    selectedValue !== null
  ) {
    const index = options.findIndex(
      (option, optionIndex) =>
        optionCandidates(option, optionIndex).some(
          candidate => sameToken(candidate, selectedValue)
        )
    );

    if (index >= 0) {
      return {
        option: options[index],
        index
      };
    }
  }

  const selectedIndex =
    payload.selectedIndex ?? payload.index;

  if (
    Number.isInteger(Number(selectedIndex)) &&
    String(selectedIndex).trim() !== '' &&
    Number(selectedIndex) >= 0 &&
    Number(selectedIndex) < options.length
  ) {
    const index = Number(selectedIndex);

    return {
      option: options[index],
      index
    };
  }

  if (
    typeof submitted === 'string' ||
    typeof submitted === 'number' ||
    typeof submitted === 'boolean'
  ) {
    const index = options.findIndex(
      (option, optionIndex) =>
        optionCandidates(option, optionIndex).some(
          candidate => sameToken(candidate, submitted)
        )
    );

    if (index >= 0) {
      return {
        option: options[index],
        index
      };
    }
  }

  return {
    option: null,
    index: -1
  };
}

function getExpectedChoiceTokens(answer) {
  if (answer === undefined || answer === null) {
    return [];
  }

  if (Array.isArray(answer)) {
    return answer;
  }

  if (typeof answer !== 'object') {
    return [answer];
  }

  if (Array.isArray(answer.correctValues)) {
    return answer.correctValues;
  }

  if (Array.isArray(answer.correctOptionIds)) {
    return answer.correctOptionIds;
  }

  if (Array.isArray(answer.correctAnswers)) {
    return answer.correctAnswers;
  }

  const keys = [
    'value',
    'correctValue',
    'optionId',
    'correctOptionId',
    'correctOptionIndex',
    'correctOption',
    'correctAnswer',
    'answer',
    'index',
    'correctIndex'
  ];

  for (const key of keys) {
    if (
      answer[key] !== undefined &&
      answer[key] !== null
    ) {
      return [answer[key]];
    }
  }

  return [];
}

function isExpectedChoiceToken(
  token,
  option,
  optionIndex
) {
  return optionCandidates(
    option,
    optionIndex
  ).some(candidate =>
    sameToken(candidate, token)
  );
}

function gradeChoice(question, submitted) {
  const options = asArray(question.options);

  const {
    option,
    index
  } = findSelectedOption(
    question,
    submitted
  );

  const anyCorrectOptionMarked =
    options.some(
      item => item.isCorrect === true
    );

  if (
    option &&
    anyCorrectOptionMarked
  ) {
    return option.isCorrect === true;
  }

  const expectedTokens =
    getExpectedChoiceTokens(
      question.answer
    );

  if (!expectedTokens.length) {
    return false;
  }

  const payload =
    submitted &&
    typeof submitted === 'object' &&
    !Array.isArray(submitted)
      ? submitted
      : {
          value: submitted
        };

  const selectedTokens = [
    payload.selectedValue,
    payload.optionValue,
    payload.optionId,
    payload.value,
    payload.selectedIndex,
    payload.index,
    submitted
  ].filter(
    value => value !== undefined && value !== null
  );

  if (option && index >= 0) {
    return expectedTokens.some(
      token =>
        isExpectedChoiceToken(
          token,
          option,
          index
        )
    );
  }

  return selectedTokens.some(
    selected =>
      expectedTokens.some(
        expected =>
          sameToken(
            expected,
            selected
          )
      )
  );
}

function itemCandidates(item, index) {
  if (
    item &&
    typeof item === 'object' &&
    !Array.isArray(item)
  ) {
    return [
      item.value,
      item.id,
      item.index,
      item.label,
      item.text,
      item.title,
      String(index),
      index
    ].filter(
      value => value !== undefined && value !== null
    );
  }

  return [
    String(index),
    index,
    item
  ].filter(
    value => value !== undefined && value !== null
  );
}

function resolveItemIndex(token, items) {
  const unwrapped = unwrapToken(token);

  if (
    Number.isInteger(unwrapped) &&
    unwrapped >= 0 &&
    unwrapped < items.length
  ) {
    return unwrapped;
  }

  const index = items.findIndex(
    (item, itemIndex) =>
      itemCandidates(
        item,
        itemIndex
      ).some(
        candidate =>
          sameToken(
            candidate,
            unwrapped
          )
      )
  );

  if (index >= 0) {
    return index;
  }

  if (
    typeof unwrapped === 'string' &&
    /^\d+$/.test(unwrapped)
  ) {
    const numeric = Number(unwrapped);

    if (
      numeric >= 0 &&
      numeric < items.length
    ) {
      return numeric;
    }
  }

  return -1;
}

function getExpectedOrder(question, items) {
  const answer = question.answer;

  const expected = Array.isArray(answer)
    ? answer
    : answer?.order ??
      answer?.sequence ??
      answer?.correctOrder ??
      answer?.items ??
      answer?.correctValues ??
      [];

  if (
    !Array.isArray(expected) ||
    !items.length
  ) {
    return [];
  }

  return expected.map(
    token =>
      resolveItemIndex(
        token,
        items
      )
  );
}

function gradeOrdering(
  question,
  submitted
) {
  const content = parseJson(
    question.content
  );

  const items = asArray(
    content.items
  );

  const payload =
    submitted &&
    typeof submitted === 'object' &&
    !Array.isArray(submitted)
      ? submitted
      : {
          submittedOrder: submitted
        };

  const submittedOrder =
    payload.submittedOrder ??
    payload.order ??
    payload.sequence;

  if (
    !Array.isArray(submittedOrder) ||
    !items.length ||
    submittedOrder.length !== items.length
  ) {
    return false;
  }

  const actual =
    submittedOrder.map(
      token =>
        resolveItemIndex(
          token,
          items
        )
    );

  const expected =
    getExpectedOrder(
      question,
      items
    );

  if (
    expected.length !== items.length ||
    actual.some(index => index < 0) ||
    new Set(actual).size !== items.length ||
    new Set(expected).size !== items.length
  ) {
    return false;
  }

  return expected.every(
    (index, position) =>
      index === actual[position]
  );
}

function getExpectedMatches(
  question,
  leftItems,
  rightItems
) {
  const answer = question.answer;

  const pairs =
    answer?.pairs ??
    answer?.matches ??
    answer?.mapping ??
    answer;

  const result = {};

  if (Array.isArray(pairs)) {
    pairs.forEach(
      (pair, index) => {
        if (
          typeof pair === 'number' ||
          typeof pair === 'string'
        ) {
          const right =
            resolveItemIndex(
              pair,
              rightItems
            );

          if (
            right >= 0 &&
            index < leftItems.length
          ) {
            result[index] = right;
          }

          return;
        }

        if (
          pair &&
          typeof pair === 'object'
        ) {
          const leftToken =
            pair.leftIndex ??
            pair.left ??
            pair.from ??
            index;

          const rightToken =
            pair.rightIndex ??
            pair.right ??
            pair.to;

          const left =
            resolveItemIndex(
              leftToken,
              leftItems
            );

          const right =
            resolveItemIndex(
              rightToken,
              rightItems
            );

          if (
            left >= 0 &&
            right >= 0
          ) {
            result[left] = right;
          }
        }
      }
    );

    return result;
  }

  if (
    pairs &&
    typeof pairs === 'object'
  ) {
    for (
      const [
        leftToken,
        rightToken
      ] of Object.entries(pairs)
    ) {
      const left =
        resolveItemIndex(
          leftToken,
          leftItems
        );

      const right =
        resolveItemIndex(
          rightToken,
          rightItems
        );

      if (
        left >= 0 &&
        right >= 0
      ) {
        result[left] = right;
      }
    }
  }

  return result;
}

function normalizeSubmittedPairs(
  value,
  leftItems,
  rightItems
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result = {};

  for (
    const [
      leftToken,
      rightToken
    ] of Object.entries(value)
  ) {
    const left =
      resolveItemIndex(
        leftToken,
        leftItems
      );

    const right =
      resolveItemIndex(
        rightToken,
        rightItems
      );

    if (
      left >= 0 &&
      right >= 0
    ) {
      result[left] = right;
    }
  }

  return result;
}

function gradeMatching(
  question,
  submitted
) {
  const content = parseJson(
    question.content
  );

  const leftItems =
    asArray(content.left);

  const rightItems =
    asArray(content.right);

  const payload =
    submitted &&
    typeof submitted === 'object' &&
    !Array.isArray(submitted)
      ? submitted
      : {};

  if (
    !leftItems.length ||
    !rightItems.length ||
    leftItems.length !== rightItems.length
  ) {
    return false;
  }

  const expected =
    getExpectedMatches(
      question,
      leftItems,
      rightItems
    );

  const actual =
    normalizeSubmittedPairs(
      payload.pairs,
      leftItems,
      rightItems
    );

  const expectedKeys =
    Object.keys(expected);

  const actualKeys =
    Object.keys(actual);

  if (
    expectedKeys.length !== leftItems.length ||
    actualKeys.length !== leftItems.length ||
    new Set(
      Object.values(actual)
    ).size !== rightItems.length
  ) {
    return false;
  }

  return expectedKeys.every(
    key =>
      expected[key] === actual[key]
  );
}

function gradeQuestion(
  question,
  submitted
) {
  switch (
    normalizeType(question.type)
  ) {
    case 'ordering':
      return gradeOrdering(
        question,
        submitted
      );

    case 'matching':
      return gradeMatching(
        question,
        submitted
      );

    case 'choice':
    case 'true_false':
    case 'case_analysis':
    default:
      return gradeChoice(
        question,
        submitted
      );
  }
}

function buildResult({
  attemptId,
  question,
  submitted,
  correct,
  showExplanation,
  savedAnswer
}) {
  const pointsAwarded =
    savedAnswer?.pointsAwarded ??
    (
      correct
        ? Number(question.points ?? 1)
        : 0
    );

  const actualCorrect =
    savedAnswer?.correct ??
    correct;

  return {
    attemptId,
    questionId: question.id,
    type: normalizeType(
      question.type
    ),
    correct: actualCorrect,
    isCorrect: actualCorrect,
    points: pointsAwarded,
    pointsAwarded,
    earnedPoints: pointsAwarded,
    answer:
      savedAnswer?.answer ??
      submitted,
    explanation:
      showExplanation
        ? question.explanation ?? ''
        : ''
  };
}

function summarizeAttempt(
  attempt,
  completedAt = attempt.completedAt
) {
  const questions =
    asArray(
      attempt.quiz?.questions
    );

  const answers =
    asArray(
      attempt.answers
    );

  const correctCount =
    answers.filter(
      answer =>
        answer.correct === true
    ).length;

  const totalQuestions =
    questions.length;

  const calculatedScore =
    answers.reduce(
      (sum, answer) =>
        sum +
        Number(
          answer.pointsAwarded ?? 0
        ),
      0
    );

  const totalPoints =
    questions.reduce(
      (sum, question) =>
        sum +
        Math.max(
          0,
          Number(
            question.points ?? 0
          )
        ),
      0
    );

  const calculatedPercentage =
    totalPoints > 0
      ? Math.round(
          (calculatedScore /
            totalPoints) *
            100
        )
      : totalQuestions > 0
        ? Math.round(
            (correctCount /
              totalQuestions) *
              100
          )
        : 0;

  const percentage =
    completedAt
      ? Number(
          attempt.percentage ??
          calculatedPercentage
        )
      : calculatedPercentage;

  const score =
    completedAt
      ? Number(
          attempt.score ??
          calculatedScore
        )
      : calculatedScore;

  const passed =
    completedAt
      ? Boolean(attempt.passed)
      : percentage >=
        Number(
          attempt.quiz?.passingScore ??
          80
        );

  const xpEarned =
    correctCount *
    Number(
      attempt.quiz?.xpPerCorrect ?? 0
    );

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    score,
    percentage,
    passed,
    correctCount,
    totalQuestions,
    answeredCount: answers.length,
    xpEarned,
    xp: xpEarned,
    message: passed
      ? 'Selamat, kamu berhasil mencapai nilai minimum kuis.'
      : `Nilai kamu ${percentage}%. Nilai minimum kelulusan adalah ${attempt.quiz?.passingScore ?? 80}%.`,
    startedAt: attempt.startedAt,
    completedAt: completedAt ?? null
  };
}

async function findAttemptForUser(
  attemptId,
  userId
) {
  return prisma.quizAttempt.findFirst({
    where: {
      id: attemptId,
      userId
    },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          status: true,
          scheduledAt: true,
          passingScore: true,
          xpPerCorrect: true,
          maxAttempts: true,
          timeLimitSeconds: true,
          showExplanation: true,
          questions: {
            select: {
              id: true,
              points: true
            },
            orderBy: {
              order: 'asc'
            }
          }
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
}

export async function startQuizAttempt(
  req,
  res,
  next
) {
  try {
    const userId =
      getUserId(req);

    const {
      quizId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        'Pengguna belum terautentikasi.'
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          status: true
        }
      });

    if (!user) {
      return sendError(
        res,
        403,
        'Profil pengguna tidak ditemukan.'
      );
    }

    if (
      user.status &&
      user.status !== 'ACTIVE'
    ) {
      return sendError(
        res,
        403,
        'Akun pengguna tidak aktif.'
      );
    }

    const quiz =
      await prisma.quiz.findFirst({
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
          title: true,
          passingScore: true,
          xpPerCorrect: true,
          maxAttempts: true,
          timeLimitSeconds: true,
          questions: {
            select: {
              id: true
            },
            orderBy: {
              order: 'asc'
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

    if (!quiz.questions.length) {
      return sendError(
        res,
        409,
        'Kuis belum memiliki soal yang dapat dikerjakan.'
      );
    }

    if (
      quiz.maxAttempts !== null &&
      quiz.maxAttempts !== undefined
    ) {
      const attemptsUsed =
        await prisma.quizAttempt.count({
          where: {
            userId,
            quizId
          }
        });

      if (
        attemptsUsed >=
        quiz.maxAttempts
      ) {
        return sendError(
          res,
          409,
          'Batas percobaan untuk kuis ini sudah tercapai.'
        );
      }
    }

    const attempt =
      await prisma.quizAttempt.create({
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
          startedAt: true,
          completedAt: true
        }
      });

    return res.status(201).json({
      success: true,
      message:
        'Percobaan kuis berhasil dimulai.',
      data: {
        attempt: {
          ...attempt,
          totalQuestions:
            quiz.questions.length
        },
        quiz: {
          id: quiz.id,
          title: quiz.title,
          passingScore:
            quiz.passingScore,
          xpPerCorrect:
            quiz.xpPerCorrect,
          timeLimitSeconds:
            quiz.timeLimitSeconds
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function submitQuizAnswer(
  req,
  res,
  next
) {
  try {
    const userId =
      getUserId(req);

    const {
      attemptId
    } = req.params;

    const {
      questionId,
      answer
    } = req.body ?? {};

    if (!userId) {
      return sendError(
        res,
        401,
        'Pengguna belum terautentikasi.'
      );
    }

    if (
      typeof questionId !== 'string' ||
      !questionId.trim()
    ) {
      return sendError(
        res,
        400,
        'questionId wajib diisi.'
      );
    }

    if (
      answer === undefined ||
      answer === null
    ) {
      return sendError(
        res,
        400,
        'Jawaban wajib dikirim.'
      );
    }

    const attempt =
      await findAttemptForUser(
        attemptId,
        userId
      );

    if (!attempt) {
      return sendError(
        res,
        404,
        'Percobaan kuis tidak ditemukan.'
      );
    }

    if (attempt.completedAt) {
      return sendError(
        res,
        409,
        'Percobaan kuis sudah selesai.'
      );
    }

    const question =
      await prisma.question.findFirst({
        where: {
          id: questionId,
          quizId: attempt.quizId
        },
        include: {
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

    if (!question) {
      return sendError(
        res,
        404,
        'Soal tidak ditemukan pada kuis ini.'
      );
    }

    const existing =
      await prisma.quizAnswer.findUnique({
        where: {
          attemptId_questionId: {
            attemptId,
            questionId
          }
        }
      });

    if (existing) {
      const result =
        buildResult({
          attemptId,
          question,
          submitted: answer,
          correct: existing.correct,
          showExplanation:
            attempt.quiz.showExplanation,
          savedAnswer: existing
        });

      return res.status(200).json({
        success: true,
        message:
          'Jawaban untuk soal ini sudah tersimpan.',
        data: {
          result
        }
      });
    }

    const correct =
      gradeQuestion(
        question,
        answer
      );

    const pointsAwarded =
      correct
        ? Math.max(
            0,
            Number(
              question.points ?? 0
            )
          )
        : 0;

    const savedAnswer =
      await prisma.quizAnswer.create({
        data: {
          attemptId,
          questionId,
          answer,
          correct,
          pointsAwarded
        }
      });

    const result =
      buildResult({
        attemptId,
        question,
        submitted: answer,
        correct,
        showExplanation:
          attempt.quiz.showExplanation,
        savedAnswer
      });

    return res.status(200).json({
      success: true,
      message:
        'Jawaban berhasil dinilai.',
      data: {
        result
      }
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      try {
        const userId =
          getUserId(req);

        const {
          attemptId
        } = req.params;

        const {
          questionId,
          answer
        } = req.body ?? {};

        const [
          attempt,
          question,
          savedAnswer
        ] = await Promise.all([
          findAttemptForUser(
            attemptId,
            userId
          ),
          prisma.question.findFirst({
            where: {
              id: questionId
            },
            include: {
              options: {
                orderBy: {
                  order: 'asc'
                }
              }
            }
          }),
          prisma.quizAnswer.findUnique({
            where: {
              attemptId_questionId: {
                attemptId,
                questionId
              }
            }
          })
        ]);

        if (
          attempt &&
          question &&
          savedAnswer
        ) {
          const result =
            buildResult({
              attemptId,
              question,
              submitted: answer,
              correct:
                savedAnswer.correct,
              showExplanation:
                attempt.quiz.showExplanation,
              savedAnswer
            });

          return res.status(200).json({
            success: true,
            message:
              'Jawaban untuk soal ini sudah tersimpan.',
            data: {
              result
            }
          });
        }
      } catch (recoveryError) {
        return next(
          recoveryError
        );
      }
    }

    return next(error);
  }
}

export async function completeQuizAttempt(
  req,
  res,
  next
) {
  try {
    const userId =
      getUserId(req);

    const {
      attemptId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        'Pengguna belum terautentikasi.'
      );
    }

    const attempt =
      await findAttemptForUser(
        attemptId,
        userId
      );

    if (!attempt) {
      return sendError(
        res,
        404,
        'Percobaan kuis tidak ditemukan.'
      );
    }

    if (attempt.completedAt) {
      const summary =
        summarizeAttempt(
          attempt,
          attempt.completedAt
        );

      return res.status(200).json({
        success: true,
        message:
          'Hasil kuis sudah tersedia.',
        data: {
          attempt: summary
        }
      });
    }

    const totalQuestions =
      attempt.quiz.questions.length;

    const answeredQuestionIds =
      new Set(
        attempt.answers.map(
          item => item.questionId
        )
      );

    const timeExpired =
      Boolean(
        attempt.quiz.timeLimitSeconds &&
        attempt.quiz.timeLimitSeconds > 0 &&
        Date.now() >
          attempt.startedAt.getTime() +
            attempt.quiz.timeLimitSeconds *
              1000
      );

    if (
      answeredQuestionIds.size <
        totalQuestions &&
      !timeExpired
    ) {
      return sendError(
        res,
        409,
        'Selesaikan semua pertanyaan sebelum mengakhiri kuis.'
      );
    }

    const correctCount =
      attempt.answers.filter(
        item =>
          item.correct === true
      ).length;

    const score =
      attempt.answers.reduce(
        (sum, item) =>
          sum +
          Number(
            item.pointsAwarded ?? 0
          ),
        0
      );

    const totalPoints =
      attempt.quiz.questions.reduce(
        (sum, question) =>
          sum +
          Math.max(
            0,
            Number(
              question.points ?? 0
            )
          ),
        0
      );

    const percentage =
      totalPoints > 0
        ? Math.round(
            (score / totalPoints) *
              100
          )
        : totalQuestions > 0
          ? Math.round(
              (correctCount /
                totalQuestions) *
                100
            )
          : 0;

    const passed =
      percentage >=
      Number(
        attempt.quiz.passingScore ??
          80
      );

    const completedAt =
      new Date();

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

    const xpEarned =
      correctCount *
      Number(
        attempt.quiz.xpPerCorrect ?? 0
      );

    const summary = {
      ...updatedAttempt,
      correctCount,
      totalQuestions,
      answeredCount:
        answeredQuestionIds.size,
      xpEarned,
      xp: xpEarned,
      message: passed
        ? 'Selamat, kamu berhasil mencapai nilai minimum kuis.'
        : `Nilai kamu ${percentage}%. Nilai minimum kelulusan adalah ${attempt.quiz.passingScore}%.`
    };

    return res.status(200).json({
      success: true,
      message:
        'Kuis berhasil diselesaikan.',
      data: {
        attempt: summary
      }
    });
  } catch (error) {
    return next(error);
  }
}