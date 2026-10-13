
import { prisma } from '../lib/prisma.js';

const quizInclude = {
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
      name: true,
      email: true
    }
  },
  updatedBy: {
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

const questionInclude = {
  options: {
    orderBy: { order: 'asc' }
  }
};

const allowedSortFields = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'order',
  'status'
]);

const allowedStatuses = new Set([
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
]);

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertValidId(id, field = 'id') {
  if (typeof id !== 'string' || !id.trim()) {
    throw createError(`${field} wajib diisi.`);
  }
}

function parsePositiveInt(value, fallback, max = 100) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizePagination(query = {}) {
  const page = parsePositiveInt(query.page, 1, 1000000);
  const limit = parsePositiveInt(query.limit, 10, 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function normalizeSort(query = {}) {
  const requestedSort = query.sortBy;
  const sortBy = allowedSortFields.has(requestedSort)
    ? requestedSort
    : 'createdAt';

  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return { [sortBy]: sortOrder };
}

function validateStatus(status) {
  if (status && !allowedStatuses.has(status)) {
    throw createError('Status kuis tidak valid.');
  }

  return status;
}

function validateQuizInput(data, { partial = false } = {}) {
  const result = {};
  const stringFields = ['title', 'description'];
  const integerFields = [
    'passingScore',
    'xpPerCorrect',
    'order',
    'timeLimitSeconds',
    'maxAttempts'
  ];
  const booleanFields = ['showExplanation', 'shuffleQuestions'];

  for (const field of stringFields) {
    if (!(field in data)) continue;

    if (field === 'title') {
      if (typeof data.title !== 'string' || !data.title.trim()) {
        throw createError('Judul kuis wajib diisi.');
      }

      result.title = data.title.trim();
      continue;
    }

    if (data[field] !== null && typeof data[field] !== 'string') {
      throw createError(`${field} harus berupa teks.`);
    }

    result[field] = data[field]?.trim() || null;
  }

  for (const field of integerFields) {
    if (!(field in data)) continue;

    const value = data[field];

    if (value === null && ['timeLimitSeconds', 'maxAttempts'].includes(field)) {
      result[field] = null;
      continue;
    }

    if (!Number.isInteger(value)) {
      throw createError(`${field} harus berupa bilangan bulat.`);
    }

    if (field === 'passingScore' && (value < 0 || value > 100)) {
      throw createError('Passing score harus berada di antara 0 dan 100.');
    }

    if (field === 'xpPerCorrect' && value < 0) {
      throw createError('XP tidak boleh negatif.');
    }

    if (field === 'order' && value < 0) {
      throw createError('Urutan kuis tidak boleh negatif.');
    }

    if (
      ['timeLimitSeconds', 'maxAttempts'].includes(field) &&
      value < 1
    ) {
      throw createError(`${field} minimal 1.`);
    }

    result[field] = value;
  }

  for (const field of booleanFields) {
    if (!(field in data)) continue;

    if (typeof data[field] !== 'boolean') {
      throw createError(`${field} harus berupa boolean.`);
    }

    result[field] = data[field];
  }

  if (!partial && !result.title) {
    throw createError('Judul kuis wajib diisi.');
  }

  return result;
}

function validateQuestionForPublishing(question) {
  const type = question.type;
  const answer = question.answer;
  const options = question.options ?? [];

  if (!question.question?.trim()) {
    throw createError(`Soal "${question.title || question.id}" belum memiliki pertanyaan.`);
  }

  if (!answer || typeof answer !== 'object') {
    throw createError(`Jawaban untuk soal "${question.title || question.id}" belum diatur.`);
  }

  if (options.length > 0) {
    const correctOptions = options.filter((option) => option.isCorrect);

    if (correctOptions.length === 0) {
      throw createError(`Soal "${question.title || question.id}" belum memiliki opsi benar.`);
    }

    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(type) && options.length < 2) {
      throw createError(`Soal "${question.title || question.id}" minimal memiliki dua opsi.`);
    }

    if (type === 'SINGLE_CHOICE' && correctOptions.length !== 1) {
      throw createError(`Soal "${question.title || question.id}" harus memiliki tepat satu opsi benar.`);
    }
  }
}

async function ensureQuizExists(tx, quizId) {
  assertValidId(quizId, 'quizId');

  const quiz = await tx.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      status: true,
      materialId: true
    }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  return quiz;
}

async function ensureMaterialAvailable(tx, materialId, currentQuizId = null) {
  assertValidId(materialId, 'materialId');

  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: {
      id: true,
      title: true,
      status: true,
      quiz: {
        select: { id: true }
      }
    }
  });

  if (!material) {
    throw createError('Materi tidak ditemukan.', 404);
  }

  if (
    material.quiz &&
    material.quiz.id !== currentQuizId
  ) {
    throw createError('Materi ini sudah memiliki kuis.', 409);
  }

  return material;
}

export async function listAdminQuizzes(query = {}) {
  const { page, limit, skip } = normalizePagination(query);
  const where = {};

  if (query.search?.trim()) {
    const search = query.search.trim();

    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { material: { title: { contains: search, mode: 'insensitive' } } }
    ];
  }

  if (query.status) {
    validateStatus(query.status);
    where.status = query.status;
  }

  if (query.materialId) {
    where.materialId = query.materialId;
  }

  const [items, total] = await prisma.$transaction([
    prisma.quiz.findMany({
      where,
      include: quizInclude,
      orderBy: normalizeSort(query),
      skip,
      take: limit
    }),
    prisma.quiz.count({ where })
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getQuizStats() {
  const [
    total,
    drafts,
    published,
    archived,
    attempts,
    questionCount,
    recentQuizzes
  ] = await prisma.$transaction([
    prisma.quiz.count(),
    prisma.quiz.count({ where: { status: 'DRAFT' } }),
    prisma.quiz.count({ where: { status: 'PUBLISHED' } }),
    prisma.quiz.count({ where: { status: 'ARCHIVED' } }),
    prisma.quizAttempt.count(),
    prisma.question.count(),
    prisma.quiz.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: quizInclude
    })
  ]);

  return {
    total,
    drafts,
    published,
    archived,
    attempts,
    questions: questionCount,
    recentQuizzes
  };
}

export async function getAdminQuizById(quizId) {
  assertValidId(quizId, 'quizId');

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      ...quizInclude,
      questions: {
        include: questionInclude,
        orderBy: { order: 'asc' }
      },
      revisions: {
        orderBy: { version: 'desc' },
        take: 10,
        select: {
          id: true,
          version: true,
          title: true,
          status: true,
          changeNote: true,
          createdAt: true,
          createdById: true
        }
      }
    }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  return quiz;
}

export async function createQuiz(data, userId) {
  assertValidId(userId, 'userId');

  if (!data || typeof data !== 'object') {
    throw createError('Data kuis tidak valid.');
  }

  const input = validateQuizInput(data);

  if (!data.materialId) {
    throw createError('Materi wajib dipilih.');
  }

  return prisma.$transaction(async (tx) => {
    await ensureMaterialAvailable(tx, data.materialId);

    const existing = await tx.quiz.findUnique({
      where: { materialId: data.materialId },
      select: { id: true }
    });

    if (existing) {
      throw createError('Materi ini sudah memiliki kuis.', 409);
    }

    return tx.quiz.create({
      data: {
        ...input,
        material: {
          connect: { id: data.materialId }
        },
        author: {
          connect: { id: userId }
        },
        status: 'DRAFT'
      },
      include: quizInclude
    });
  });
}

export async function updateQuiz(quizId, data, userId) {
  assertValidId(quizId, 'quizId');
  assertValidId(userId, 'userId');

  if (!data || typeof data !== 'object') {
    throw createError('Data pembaruan tidak valid.');
  }

  const input = validateQuizInput(data, { partial: true });

  return prisma.$transaction(async (tx) => {
    const current = await ensureQuizExists(tx, quizId);

    if (current.status === 'PUBLISHED') {
      throw createError('Kuis terpublikasi harus dikembalikan ke draft sebelum diedit.', 409);
    }

    if (data.materialId && data.materialId !== current.materialId) {
      await ensureMaterialAvailable(tx, data.materialId, quizId);
      input.material = {
        connect: { id: data.materialId }
      };
    }

    return tx.quiz.update({
      where: { id: quizId },
      data: {
        ...input,
        updatedBy: {
          connect: { id: userId }
        },
        contentVersion: { increment: 1 }
      },
      include: quizInclude
    });
  });
}

export async function deleteQuiz(quizId) {
  assertValidId(quizId, 'quizId');

  return prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        status: true,
        _count: {
          select: { attempts: true }
        }
      }
    });

    if (!quiz) {
      throw createError('Kuis tidak ditemukan.', 404);
    }

    if (quiz.status === 'PUBLISHED') {
      throw createError('Kuis terpublikasi harus di-unpublish sebelum dihapus.', 409);
    }

    if (quiz._count.attempts > 0) {
      throw createError('Kuis memiliki riwayat pengerjaan. Arsipkan kuis agar riwayat tetap terjaga.', 409);
    }

    await tx.quiz.delete({
      where: { id: quizId }
    });

    return { id: quizId, deleted: true };
  });
}

export async function publishQuiz(quizId, userId) {
  assertValidId(quizId, 'quizId');
  assertValidId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await ensureQuizExists(tx, quizId);

    if (quiz.status === 'PUBLISHED') {
      throw createError('Kuis sudah terpublikasi.', 409);
    }

    if (quiz.questions.length === 0) {
      throw createError('Kuis harus memiliki minimal satu soal.');
    }

    for (const question of quiz.questions) {
      validateQuestionForPublishing(question);
    }

    const material = await tx.material.findUnique({
      where: { id: quiz.materialId },
      select: { id: true, status: true }
    });

    if (!material || material.status !== 'PUBLISHED') {
      throw createError('Materi harus terpublikasi sebelum kuis dapat dipublikasikan.', 409);
    }

    return tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy: {
          connect: { id: userId }
        },
        contentVersion: { increment: 1 }
      },
      include: quizInclude
    });
  });
}

export async function unpublishQuiz(quizId, userId) {
  assertValidId(quizId, 'quizId');
  assertValidId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await ensureQuizExists(tx, quizId);

    if (quiz.status !== 'PUBLISHED') {
      throw createError('Kuis belum terpublikasi.', 409);
    }

    return tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'DRAFT',
        publishedAt: null,
        updatedBy: {
          connect: { id: userId }
        },
        contentVersion: { increment: 1 }
      },
      include: quizInclude
    });
  });
}

export async function previewQuiz(quizId) {
  const quiz = await getAdminQuizById(quizId);

  if (quiz.questions.length === 0) {
    throw createError('Tambahkan minimal satu soal sebelum melakukan preview.');
  }

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    xpPerCorrect: quiz.xpPerCorrect,
    timeLimitSeconds: quiz.timeLimitSeconds,
    showExplanation: quiz.showExplanation,
    shuffleQuestions: quiz.shuffleQuestions,
    material: quiz.material,
    questions: quiz.questions.map((question) => ({
      ...question,
      answer: question.answer
    }))
  };
}

export async function archiveQuiz(quizId, userId) {
  assertValidId(quizId, 'quizId');
  assertValidId(userId, 'userId');

  return prisma.$transaction(async (tx) => {
    const quiz = await ensureQuizExists(tx, quizId);

    if (quiz.status === 'PUBLISHED') {
      throw createError('Unpublish kuis sebelum mengarsipkannya.', 409);
    }

    return tx.quiz.update({
      where: { id: quizId },
      data: {
        status: 'ARCHIVED',
        updatedBy: {
          connect: { id: userId }
        }
      },
      include: quizInclude
    });
  });
}
