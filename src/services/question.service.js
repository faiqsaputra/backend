
import { prisma } from '../lib/prisma.js';

const questionInclude = {
  options: { orderBy: { order: 'asc' } }
};

function createError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function assertId(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(`${field} wajib diisi.`);
  }
}

function validateQuestionInput(data, { partial = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createError('Data soal tidak valid.');
  }

  const result = {};

  if (!partial || 'type' in data) {
    if (typeof data.type !== 'string' || !data.type.trim()) {
      throw createError('Jenis soal wajib diisi.');
    }

    result.type = data.type.trim();
  }

  if (!partial || 'question' in data) {
    if (typeof data.question !== 'string' || !data.question.trim()) {
      throw createError('Pertanyaan wajib diisi.');
    }

    result.question = data.question.trim();
  }

  if ('title' in data) {
    if (data.title !== null && typeof data.title !== 'string') {
      throw createError('Judul soal harus berupa teks.');
    }

    result.title = data.title?.trim() || null;
  }

  if ('content' in data) {
    if (data.content === undefined) {
      throw createError('Konten soal tidak valid.');
    }

    result.content = data.content;
  }

  if ('answer' in data || !partial) {
    if (
      !data.answer ||
      typeof data.answer !== 'object' ||
      Array.isArray(data.answer)
    ) {
      throw createError('Jawaban harus berupa objek JSON.');
    }

    result.answer = data.answer;
  }

  if ('explanation' in data) {
    if (data.explanation !== null && typeof data.explanation !== 'string') {
      throw createError('Pembahasan harus berupa teks.');
    }

    result.explanation = data.explanation?.trim() || null;
  }

  for (const field of ['points', 'order']) {
    if (!(field in data)) continue;

    if (!Number.isInteger(data[field]) || data[field] < 0) {
      throw createError(`${field} harus berupa bilangan bulat nonnegatif.`);
    }

    result[field] = data[field];
  }

  if ('options' in data) {
    if (!Array.isArray(data.options)) {
      throw createError('Opsi jawaban harus berupa array.');
    }

    result.options = data.options.map((option, index) => {
      if (
        !option ||
        typeof option.label !== 'string' ||
        !option.label.trim() ||
        typeof option.value !== 'string' ||
        !option.value.trim()
      ) {
        throw createError(`Opsi ke-${index + 1} memiliki label atau value yang tidak valid.`);
      }

      if (
        option.isCorrect !== undefined &&
        typeof option.isCorrect !== 'boolean'
      ) {
        throw createError(`isCorrect pada opsi ke-${index + 1} harus berupa boolean.`);
      }

      const order = option.order ?? index;

      if (!Number.isInteger(order) || order < 0) {
        throw createError(`Urutan opsi ke-${index + 1} tidak valid.`);
      }

      return {
        label: option.label.trim(),
        value: option.value.trim(),
        isCorrect: option.isCorrect ?? false,
        order
      };
    });

    const values = result.options.map((option) => option.value);

    if (new Set(values).size !== values.length) {
      throw createError('Value opsi harus unik dalam satu soal.');
    }
  }

  return result;
}

async function ensureEditableQuiz(tx, quizId) {
  const quiz = await tx.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      status: true,
      _count: { select: { attempts: true } }
    }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  if (quiz.status === 'PUBLISHED') {
    throw createError('Unpublish kuis sebelum mengubah soal.', 409);
  }

  return quiz;
}

async function ensureQuestionBelongsToQuiz(tx, quizId, questionId) {
  const question = await tx.question.findFirst({
    where: { id: questionId, quizId },
    include: {
      ...questionInclude,
      _count: { select: { answers: true } }
    }
  });

  if (!question) {
    throw createError('Soal tidak ditemukan pada kuis ini.', 404);
  }

  return question;
}

export async function listQuestions(quizId) {
  assertId(quizId, 'quizId');

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true }
  });

  if (!quiz) {
    throw createError('Kuis tidak ditemukan.', 404);
  }

  return prisma.question.findMany({
    where: { quizId },
    include: questionInclude,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
  });
}

export async function getQuestionById(quizId, questionId) {
  assertId(quizId, 'quizId');
  assertId(questionId, 'questionId');

  const question = await prisma.question.findFirst({
    where: { id: questionId, quizId },
    include: questionInclude
  });

  if (!question) {
    throw createError('Soal tidak ditemukan pada kuis ini.', 404);
  }

  return question;
}

export async function createQuestion(quizId, data) {
  assertId(quizId, 'quizId');

  const input = validateQuestionInput(data);

  return prisma.$transaction(async (tx) => {
    const quiz = await ensureEditableQuiz(tx, quizId);

    const count = await tx.question.count({ where: { quizId } });

    if (input.order === undefined) {
      input.order = count;
    }

    return tx.question.create({
      data: {
        quiz: { connect: { id: quiz.id } },
        type: input.type,
        title: input.title ?? null,
        question: input.question,
        content: input.content,
        answer: input.answer,
        explanation: input.explanation ?? null,
        points: input.points ?? 1,
        order: input.order,
        ...(input.options
          ? {
              options: {
                create: input.options
              }
            }
          : {})
      },
      include: questionInclude
    });
  });
}

export async function updateQuestion(quizId, questionId, data) {
  assertId(quizId, 'quizId');
  assertId(questionId, 'questionId');

  const input = validateQuestionInput(data, { partial: true });

  return prisma.$transaction(async (tx) => {
    await ensureEditableQuiz(tx, quizId);

    const question = await ensureQuestionBelongsToQuiz(
      tx,
      quizId,
      questionId
    );

    if (question._count.answers > 0) {
      throw createError(
        'Soal memiliki riwayat jawaban. Perubahan soal diblokir untuk menjaga integritas hasil.',
        409
      );
    }

    const { options, ...fields } = input;

    return tx.question.update({
      where: { id: questionId },
      data: {
        ...fields,
        ...(options
          ? {
              options: {
                deleteMany: {},
                create: options
              }
            }
          : {})
      },
      include: questionInclude
    });
  });
}

export async function deleteQuestion(quizId, questionId) {
  assertId(quizId, 'quizId');
  assertId(questionId, 'questionId');

  return prisma.$transaction(async (tx) => {
    await ensureEditableQuiz(tx, quizId);

    const question = await ensureQuestionBelongsToQuiz(
      tx,
      quizId,
      questionId
    );

    if (question._count.answers > 0) {
      throw createError(
        'Soal memiliki riwayat jawaban dan tidak dapat dihapus.',
        409
      );
    }

    await tx.question.delete({
      where: { id: questionId }
    });

    return { id: questionId, deleted: true };
  });
}

export async function reorderQuestions(quizId, questionIds) {
  assertId(quizId, 'quizId');

  if (!Array.isArray(questionIds) || questionIds.some((id) => typeof id !== 'string')) {
    throw createError('questionIds harus berupa array ID soal.');
  }

  if (new Set(questionIds).size !== questionIds.length) {
    throw createError('ID soal tidak boleh duplikat.');
  }

  return prisma.$transaction(async (tx) => {
    await ensureEditableQuiz(tx, quizId);

    const existing = await tx.question.findMany({
      where: { quizId },
      select: { id: true }
    });

    const existingIds = new Set(existing.map((question) => question.id));

    if (
      existingIds.size !== questionIds.length ||
      questionIds.some((id) => !existingIds.has(id))
    ) {
      throw createError('Urutan harus memuat semua soal pada kuis tepat satu kali.');
    }

    for (const [order, id] of questionIds.entries()) {
      await tx.question.update({
        where: { id },
        data: { order }
      });
    }

    return tx.question.findMany({
      where: { quizId },
      include: questionInclude,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    });
  });
}

