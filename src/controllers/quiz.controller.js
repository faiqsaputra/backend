
import {
  quizCreateSchema,
  quizUpdateSchema,
  quizListSchema,
  quizPublishSchema,
  quizIdParamsSchema
} from '../schemas/quiz.schema.js';

import {
  questionCreateSchema,
  questionUpdateSchema,
  questionReorderSchema,
  questionIdParamsSchema
} from '../schemas/question.schema.js';

import {
  listAdminQuizzes,
  getQuizStats,
  getAdminQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  previewQuiz
} from '../services/quiz.service.js';

import {
  listQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions
} from '../services/question.service.js';

import {
  validateQuizForPublish,
  publishQuiz as publishQuizService,
  unpublishQuiz as unpublishQuizService,
  archiveQuiz as archiveQuizService
} from '../services/quiz-publish.service.js';

function sendError(res, message, errors, status = 400) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {})
  });
}

function validate(schema, data, res, message = 'Validasi request gagal') {
  const result = schema.safeParse(data);

  if (!result.success) {
    sendError(res, message, result.error.flatten());
    return null;
  }

  return result.data;
}

function getUserId(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function requireUser(req, res) {
  const userId = getUserId(req);

  if (!userId) {
    sendError(res, 'Identitas pengguna tidak ditemukan', null, 401);
    return null;
  }

  return userId;
}

function sendSuccess(res, message, data, status = 200) {
  return res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {})
  });
}

function handleError(next, error) {
  return next(error);
}

// ============================================================
// QUIZ LIST & STATISTICS
// ============================================================

export async function listQuizzes(req, res, next) {
  try {
    const query = validate(quizListSchema, req.query, res);

    if (!query) return;

    const result = await listAdminQuizzes(query);

    return sendSuccess(res, 'Daftar quiz berhasil diambil', result);
  } catch (error) {
    return handleError(next, error);
  }
}

export async function quizStats(req, res, next) {
  try {
    const stats = await getQuizStats();

    return sendSuccess(res, 'Statistik quiz berhasil diambil', stats);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// QUIZ DETAIL
// ============================================================

export async function getQuiz(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const quiz = await getAdminQuizById(params.quizId);

    if (!quiz) {
      return sendError(res, 'Quiz tidak ditemukan', null, 404);
    }

    return sendSuccess(res, 'Detail quiz berhasil diambil', quiz);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// CREATE QUIZ
// ============================================================

export async function createQuizHandler(req, res, next) {
  try {
    const userId = requireUser(req, res);

    if (!userId) return;

    const data = validate(quizCreateSchema, req.body ?? {}, res);

    if (!data) return;

    const quiz = await createQuiz(data, userId);

    return sendSuccess(res, 'Quiz berhasil dibuat', quiz, 201);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// UPDATE QUIZ
// ============================================================

export async function updateQuizHandler(req, res, next) {
  try {
    const userId = requireUser(req, res);

    if (!userId) return;

    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const data = validate(quizUpdateSchema, req.body ?? {}, res);

    if (!data) return;

    const quiz = await updateQuiz(params.quizId, data, userId);

    return sendSuccess(res, 'Quiz berhasil diperbarui', quiz);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// DELETE QUIZ
// ============================================================

export async function deleteQuizHandler(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    await deleteQuiz(params.quizId);

    return sendSuccess(res, 'Quiz berhasil dihapus');
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// QUESTION LIST & DETAIL
// ============================================================

export async function listQuizQuestions(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const questions = await listQuestions(params.quizId);

    return sendSuccess(res, 'Daftar soal berhasil diambil', questions);
  } catch (error) {
    return handleError(next, error);
  }
}

export async function getQuizQuestion(req, res, next) {
  try {
    const params = validate(questionIdParamsSchema, req.params, res);

    if (!params) return;

    const question = await getQuestionById(params.quizId, params.questionId);

    if (!question) {
      return sendError(res, 'Soal tidak ditemukan', null, 404);
    }

    return sendSuccess(res, 'Detail soal berhasil diambil', question);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// CREATE QUESTION
// ============================================================

export async function createQuizQuestion(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const data = validate(questionCreateSchema, req.body ?? {}, res);

    if (!data) return;

    const question = await createQuestion(params.quizId, data);

    return sendSuccess(res, 'Soal berhasil ditambahkan', question, 201);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// UPDATE QUESTION
// ============================================================

export async function updateQuizQuestion(req, res, next) {
  try {
    const params = validate(questionIdParamsSchema, req.params, res);

    if (!params) return;

    const data = validate(questionUpdateSchema, req.body ?? {}, res);

    if (!data) return;

    const question = await updateQuestion(
      params.quizId,
      params.questionId,
      data
    );

    return sendSuccess(res, 'Soal berhasil diperbarui', question);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// DELETE QUESTION
// ============================================================

export async function deleteQuizQuestion(req, res, next) {
  try {
    const params = validate(questionIdParamsSchema, req.params, res);

    if (!params) return;

    await deleteQuestion(params.quizId, params.questionId);

    return sendSuccess(res, 'Soal berhasil dihapus');
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// REORDER QUESTIONS
// ============================================================

export async function reorderQuizQuestions(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const data = validate(questionReorderSchema, req.body ?? {}, res);

    if (!data) return;

    const questions = await reorderQuestions(
      params.quizId,
      data.questionIds
    );

    return sendSuccess(res, 'Urutan soal berhasil diperbarui', questions);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// PREVIEW QUIZ
// ============================================================

export async function previewQuizHandler(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const preview = await previewQuiz(params.quizId);

    return sendSuccess(res, 'Preview quiz berhasil diambil', preview);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// VALIDATE QUIZ FOR PUBLISH
// ============================================================

export async function validateQuizPublish(req, res, next) {
  try {
    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const result = await validateQuizForPublish(params.quizId);

    return sendSuccess(res, 'Validasi publikasi selesai', result);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// PUBLISH QUIZ
// ============================================================

export async function publishQuizHandler(req, res, next) {
  try {
    const userId = requireUser(req, res);

    if (!userId) return;

    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const options = validate(quizPublishSchema, req.body ?? {}, res);

    if (!options) return;

    const quiz = await publishQuizService(params.quizId, userId, options);

    return sendSuccess(res, 'Quiz berhasil dipublikasikan', quiz);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// UNPUBLISH QUIZ
// ============================================================

export async function unpublishQuizHandler(req, res, next) {
  try {
    const userId = requireUser(req, res);

    if (!userId) return;

    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const quiz = await unpublishQuizService(params.quizId, userId);

    return sendSuccess(res, 'Publikasi quiz berhasil dibatalkan', quiz);
  } catch (error) {
    return handleError(next, error);
  }
}

// ============================================================
// ARCHIVE QUIZ
// ============================================================

export async function archiveQuizHandler(req, res, next) {
  try {
    const userId = requireUser(req, res);

    if (!userId) return;

    const params = validate(quizIdParamsSchema, req.params, res);

    if (!params) return;

    const quiz = await archiveQuizService(params.quizId, userId);

    return sendSuccess(res, 'Quiz berhasil diarsipkan', quiz);
  } catch (error) {
    return handleError(next, error);
  }
}
