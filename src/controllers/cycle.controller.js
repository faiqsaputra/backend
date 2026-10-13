import {
  createCycleSchema,
  updateCycleSchema,
  cycleListSchema,
  cyclePredictionSchema,
  cycleIdSchema
} from '../schemas/cycle.schema.js';

import {
  createCycle,
  listCycles,
  getCycleById,
  updateCycle,
  deleteCycle,
  getCyclePrediction
} from '../services/cycle.service.js';

function getAuthenticatedUserId(req, res) {
  const userId = req.user?.id ?? req.auth?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Silakan login terlebih dahulu.'
    });

    return null;
  }

  return userId;
}

function sendValidationError(res, message, error) {
  return res.status(400).json({
    success: false,
    message,
    errors: error.flatten()
  });
}

function sendError(res, error) {
  if (error.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'Catatan dengan tipe dan tanggal mulai tersebut sudah ada.'
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Catatan siklus tidak ditemukan.'
    });
  }

  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error('Cycle API error:', error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500
      ? 'Terjadi kesalahan pada server.'
      : error.message
  });
}

export async function createCycleController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const parsed = createCycleSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendValidationError(
        res,
        'Data pencatatan siklus tidak valid.',
        parsed.error
      );
    }

    const cycle = await createCycle(userId, parsed.data);

    return res.status(201).json({
      success: true,
      message: 'Catatan siklus berhasil disimpan.',
      data: cycle
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listCyclesController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const parsed = cycleListSchema.safeParse(req.query);

    if (!parsed.success) {
      return sendValidationError(
        res,
        'Parameter daftar siklus tidak valid.',
        parsed.error
      );
    }

    const result = await listCycles(userId, parsed.data);

    return res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getCycleController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const parsed = cycleIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return sendValidationError(
        res,
        'ID catatan tidak valid.',
        parsed.error
      );
    }

    const cycle = await getCycleById(userId, parsed.data.id);

    return res.status(200).json({
      success: true,
      data: cycle
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateCycleController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const idParsed = cycleIdSchema.safeParse(req.params);

    if (!idParsed.success) {
      return sendValidationError(
        res,
        'ID catatan tidak valid.',
        idParsed.error
      );
    }

    const bodyParsed = updateCycleSchema.safeParse(req.body);

    if (!bodyParsed.success) {
      return sendValidationError(
        res,
        'Data pembaruan siklus tidak valid.',
        bodyParsed.error
      );
    }

    const cycle = await updateCycle(
      userId,
      idParsed.data.id,
      bodyParsed.data
    );

    return res.status(200).json({
      success: true,
      message: 'Catatan siklus berhasil diperbarui.',
      data: cycle
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function deleteCycleController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const parsed = cycleIdSchema.safeParse(req.params);

    if (!parsed.success) {
      return sendValidationError(
        res,
        'ID catatan tidak valid.',
        parsed.error
      );
    }

    const result = await deleteCycle(userId, parsed.data.id);

    return res.status(200).json({
      success: true,
      message: 'Catatan siklus berhasil dihapus.',
      data: result
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getCyclePredictionController(req, res) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return;

  try {
    const parsed = cyclePredictionSchema.safeParse({
      limit: req.query.limit ?? 24
    });

    if (!parsed.success) {
      return sendValidationError(
        res,
        'Parameter prediksi tidak valid.',
        parsed.error
      );
    }

    const result = await getCyclePrediction(userId, parsed.data);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return sendError(res, error);
  }
}