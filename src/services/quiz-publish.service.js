import { prisma } from '../lib/prisma.js';

const publishInclude = {
  material: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true
    }
  },
  author: {
    select: {
      id: true,
      name: true
    }
  },
  publishedBy: {
    select: {
      id: true,
      name: true
    }
  },
  _count: {
    select: {
      questions: true,
      attempts: true
    }
  }
};

const SINGLE_CHOICE_TYPES = new Set([
  'SINGLE_CHOICE',
  'SINGLE_SELECT'
]);

const MULTIPLE_CHOICE_TYPES = new Set([
  'MULTIPLE_CHOICE',
  'MULTI_SELECT'
]);

const ORDERING_TYPES = new Set([
  'ORDERING',
  'ORDER',
  'SEQUENCE'
]);

const MATCHING_TYPES = new Set([
  'MATCHING',
  'MATCH',
  'PAIRING'
]);

function createError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function assertId(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(`${field} wajib diisi.`);
  }
}

function normalizeQuestionType(type) {
  return String(type ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function getQuestionLabel(question) {
  const title = question?.title?.trim();

  if (title) return title;

  const text = typeof question?.question === 'string'
    ? question.question
    : '';

  return text.slice(0, 80) || 'Soal tanpa judul';
}

async function getQuizForPublishing(tx, quizId) {
  assertId(quizId, 'quizId');

  const quiz = await tx.quiz.findUnique({
    where: { id: quizId },
    include: {
      material: {
        select: {
          id: true,
          title: true,
          status: true
        }
      },
      questions: {
        include: {
          options: {
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { order: 'asc' }
      }
    }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  return quiz;
}

function validateQuestion(question) {
  const label = getQuestionLabel(question);
  const type = normalizeQuestionType(question.type);
  const answer = question.answer;
  const options = question.options ?? [];

  if (typeof question.question !== 'string' || !question.question.trim()) {
    throw createError(`Soal "${label}" belum memiliki teks pertanyaan.`);
  }

  // Array diperbolehkan agar jawaban ordering dan matching tidak ditolak.
  const validAnswerObject =
    answer !== null &&
    typeof answer === 'object' &&
    (
      Array.isArray(answer)
        ? answer.length > 0
        : Object.keys(answer).length > 0
    );

  if (!validAnswerObject) {
    throw createError(`Soal "${label}" belum memiliki jawaban yang valid.`);
  }

  if (!Number.isInteger(question.points) || question.points < 0) {
    throw createError(`Poin soal "${label}" tidak valid.`);
  }

  if (!Array.isArray(options)) {
    throw createError(`Opsi soal "${label}" harus berupa array.`);
  }

  if (options.length === 0) {
    if (
      SINGLE_CHOICE_TYPES.has(type) ||
      MULTIPLE_CHOICE_TYPES.has(type)
    ) {
      throw createError(`Soal "${label}" harus memiliki minimal dua opsi.`);
    }

    // Ordering, matching, dan tipe soal tanpa opsi dapat menggunakan content.
    return;
  }

  const invalidOption = options.some((option) => (
    typeof option?.label !== 'string' ||
    !option.label.trim() ||
    typeof option?.value !== 'string' ||
    !option.value.trim()
  ));

  if (invalidOption) {
    throw createError(`Soal "${label}" memiliki opsi yang belum lengkap.`);
  }

  const values = options.map((option) => option.value.trim());

  if (new Set(values).size !== values.length) {
    throw createError(`Soal "${label}" memiliki value opsi duplikat.`);
  }

  // Opsi pada ordering dan matching tidak selalu memiliki satu
  // opsi benar seperti pada pilihan ganda.
  if (
    ORDERING_TYPES.has(type) ||
    MATCHING_TYPES.has(type)
  ) {
    return;
  }

  const correctOptions = options.filter((option) => option.isCorrect);

  if (correctOptions.length === 0) {
    throw createError(`Soal "${label}" belum memiliki opsi jawaban benar.`);
  }

  if (
    SINGLE_CHOICE_TYPES.has(type) &&
    options.length < 2
  ) {
    throw createError(`Soal "${label}" harus memiliki minimal dua opsi.`);
  }

  if (
    SINGLE_CHOICE_TYPES.has(type) &&
    correctOptions.length !== 1
  ) {
    throw createError(`Soal "${label}" harus memiliki tepat satu opsi benar.`);
  }

  if (
    MULTIPLE_CHOICE_TYPES.has(type) &&
    options.length < 2
  ) {
    throw createError(`Soal "${label}" harus memiliki minimal dua opsi.`);
  }
}

function getQuizValidationErrors(quiz) {
  const errors = [];

  if (!quiz.title?.trim()) {
    errors.push('Judul kuis wajib diisi.');
  }

  if (
    !Number.isInteger(quiz.passingScore) ||
    quiz.passingScore < 0 ||
    quiz.passingScore > 100
  ) {
    errors.push('Passing score harus berada di antara 0 dan 100.');
  }

  if (
    !Number.isInteger(quiz.xpPerCorrect) ||
    quiz.xpPerCorrect < 0
  ) {
    errors.push('XP per jawaban benar tidak valid.');
  }

  if (!quiz.material) {
    errors.push('Kuis belum terhubung dengan materi yang valid.');
  } else if (quiz.material.status !== 'PUBLISHED') {
    errors.push('Materi harus dipublikasikan sebelum kuis.');
  }

  if (!quiz.questions?.length) {
    errors.push('Tambahkan minimal satu soal sebelum publikasi.');
  } else {
    for (const question of quiz.questions) {
      try {
        validateQuestion(question);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  return errors;
}

function assertQuizCanPublish(quiz) {
  const errors = getQuizValidationErrors(quiz);

  if (errors.length) {
    throw createError(errors[0], 400);
  }
}

async function createRevision(tx, quiz, userId, changeNote) {
  const latestRevision = await tx.quizRevision.findFirst({
    where: { quizId: quiz.id },
    orderBy: { version: 'desc' },
    select: { version: true }
  });

  const version = (latestRevision?.version ?? 0) + 1;

  return tx.quizRevision.create({
    data: {
      quizId: quiz.id,
      version,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      xpPerCorrect: quiz.xpPerCorrect,
      status: 'DRAFT',
      changeNote: changeNote || null,
      createdById: userId
    }
  });
}

export async function validateQuizForPublish(quizId) {
  assertId(quizId, 'quizId');

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      material: {
        select: {
          id: true,
          title: true,
          status: true
        }
      },
      questions: {
        include: {
          options: {
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { order: 'asc' }
      }
    }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  const errors = getQuizValidationErrors(quiz);

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      quizId: quiz.id,
      title: quiz.title,
      materialId: quiz.materialId,
      materialTitle: quiz.material?.title ?? null,
      questionCount: quiz.questions.length,
      passingScore: quiz.passingScore
    }
  };
}

export async function publishQuiz(quizId, userId, options = {}) {
  assertId(quizId, 'quizId');
  assertId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await getQuizForPublishing(tx, quizId);

    if (quiz.status === 'PUBLISHED') {
      throw createError('Kuis sudah dipublikasikan.', 409);
    }

    if (quiz.status === 'ARCHIVED') {
      throw createError(
        'Kuis yang diarsipkan tidak dapat langsung dipublikasikan.',
        409
      );
    }

    assertQuizCanPublish(quiz);

    const revision = await createRevision(
      tx,
      quiz,
      userId,
      options.changeNote || 'Publikasi kuis'
    );

    const publishedQuiz = await tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy: {
          connect: { id: userId }
        },
        updatedBy: {
          connect: { id: userId }
        },
        contentVersion: {
          increment: 1
        }
      },
      include: publishInclude
    });

    return {
      quiz: publishedQuiz,
      revision
    };
  });
}

export async function unpublishQuiz(quizId, userId, options = {}) {
  assertId(quizId, 'quizId');
  assertId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await getQuizForPublishing(tx, quizId);

    if (quiz.status !== 'PUBLISHED') {
      throw createError('Kuis belum dipublikasikan.', 409);
    }

    const updatedQuiz = await tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'DRAFT',
        publishedAt: null,
        updatedBy: {
          connect: { id: userId }
        },
        contentVersion: {
          increment: 1
        }
      },
      include: publishInclude
    });

    return {
      quiz: updatedQuiz,
      message: options.reason || 'Kuis berhasil dikembalikan ke draft.'
    };
  });
}

export async function archiveQuiz(quizId, userId) {
  assertId(quizId, 'quizId');
  assertId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await getQuizForPublishing(tx, quizId);

    if (quiz.status === 'PUBLISHED') {
      throw createError(
        'Batalkan publikasi kuis sebelum mengarsipkannya.',
        409
      );
    }

    return tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'ARCHIVED',
        updatedBy: {
          connect: { id: userId }
        },
        contentVersion: {
          increment: 1
        }
      },
      include: publishInclude
    });
  });
}