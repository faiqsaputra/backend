import { prisma } from '../lib/prisma.js';

const RECORD_TYPES = ['HAID', 'NIFAS', 'ISTIHADHAH'];
const DEFAULT_CYCLE_LENGTH = 28;
const MIN_CYCLE_LENGTH = 15;
const MAX_CYCLE_LENGTH = 60;
const MAX_HISTORY = 24;
const MAX_INTERVALS_FOR_AVERAGE = 6;
const MAX_HAID_DAYS = 15;
const MAX_NIFAS_DAYS = 60;

function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getCycleModel() {
  const model = prisma.cycle;

  if (
    !model ||
    typeof model.create !== 'function' ||
    typeof model.findMany !== 'function'
  ) {
    throw createServiceError(
      'Prisma Client belum menyediakan model Cycle. Cocokkan schema, generator output, dan import Prisma Client, kemudian jalankan prisma generate.',
      500
    );
  }

  return model;
}

function getUserId(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw createServiceError('User tidak terautentikasi', 401);
  }

  return userId;
}

function validateRecordType(type = 'HAID') {
  const normalizedType = String(type).toUpperCase();

  if (!RECORD_TYPES.includes(normalizedType)) {
    throw createServiceError(
      `Tipe pencatatan harus salah satu dari: ${RECORD_TYPES.join(', ')}`
    );
  }

  return normalizedType;
}

function parseDate(value, fieldName) {
  if (!value) {
    throw createServiceError(`${fieldName} wajib diisi`);
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createServiceError(
      `${fieldName} harus menggunakan format YYYY-MM-DD`
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw createServiceError(`${fieldName} bukan tanggal yang valid`);
  }

  return date;
}

function validateDateRange(startDate, endDate, type = 'HAID') {
  if (!endDate) return;

  if (endDate < startDate) {
    throw createServiceError(
      'Tanggal selesai tidak boleh sebelum tanggal mulai'
    );
  }

  const duration = Math.floor(
    (endDate.getTime() - startDate.getTime()) / 86400000
  ) + 1;

  const maxDuration = type === 'HAID'
    ? MAX_HAID_DAYS
    : type === 'NIFAS'
      ? MAX_NIFAS_DAYS
      : null;

  if (maxDuration !== null && duration > maxDuration) {
    throw createServiceError(
      `Durasi ${type} tidak boleh melebihi ${maxDuration} hari`
    );
  }
}

function normalizePagination(limit, offset) {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);

  return {
    take: Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 50,
    skip: Number.isFinite(parsedOffset)
      ? Math.max(parsedOffset, 0)
      : 0
  };
}

function getTodayInJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const part = (type) => parts.find((item) => item.type === type)?.value;

  return new Date(
    `${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`
  );
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function calculateCycleLength(previousDate, currentDate) {
  return Math.round(
    (currentDate.getTime() - previousDate.getTime()) / 86400000
  );
}

function calculateAverage(values) {
  if (!values.length) return null;

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

async function ensureNoDuplicate(userId, type, startDate, excludeId = null) {
  const where = {
    userId,
    type,
    startDate
  };

  if (excludeId) {
    where.id = { not: excludeId };
  }

  const duplicate = await getCycleModel().findFirst({ where });

  if (duplicate) {
    throw createServiceError(
      'Catatan dengan tipe dan tanggal mulai tersebut sudah ada.',
      409
    );
  }
}

export async function createCycle(userId, payload) {
  const ownerId = getUserId(userId);
  const type = validateRecordType(payload.type ?? 'HAID');
  const startDate = parseDate(payload.startDate, 'Tanggal mulai');
  const endDate = payload.endDate
    ? parseDate(payload.endDate, 'Tanggal selesai')
    : null;

  validateDateRange(startDate, endDate, type);
  await ensureNoDuplicate(ownerId, type, startDate);

  return getCycleModel().create({
    data: {
      userId: ownerId,
      type,
      startDate,
      endDate
    }
  });
}

export async function listCycles(userId, query = {}) {
  const ownerId = getUserId(userId);
  const { take, skip } = normalizePagination(query.limit, query.offset);
  const where = { userId: ownerId };

  if (query.type) {
    where.type = validateRecordType(query.type);
  }

  const model = getCycleModel();

  const [items, total] = await prisma.$transaction([
    model.findMany({
      where,
      orderBy: [
        { startDate: 'desc' },
        { createdAt: 'desc' }
      ],
      take,
      skip
    }),
    model.count({ where })
  ]);

  return {
    items,
    pagination: {
      total,
      limit: take,
      offset: skip,
      hasMore: skip + items.length < total
    }
  };
}

export async function getCycleById(userId, cycleId) {
  const ownerId = getUserId(userId);

  const cycle = await getCycleModel().findFirst({
    where: {
      id: cycleId,
      userId: ownerId
    }
  });

  if (!cycle) {
    throw createServiceError('Catatan siklus tidak ditemukan', 404);
  }

  return cycle;
}

export async function updateCycle(userId, cycleId, payload) {
  const ownerId = getUserId(userId);
  const existing = await getCycleById(ownerId, cycleId);

  const type = payload.type !== undefined
    ? validateRecordType(payload.type)
    : existing.type;

  const startDate = payload.startDate !== undefined
    ? parseDate(payload.startDate, 'Tanggal mulai')
    : existing.startDate;

  const endDate = payload.endDate !== undefined
    ? payload.endDate
      ? parseDate(payload.endDate, 'Tanggal selesai')
      : null
    : existing.endDate;

  validateDateRange(startDate, endDate, type);

  if (
    type !== existing.type ||
    startDate.getTime() !== existing.startDate.getTime()
  ) {
    await ensureNoDuplicate(ownerId, type, startDate, existing.id);
  }

  const data = {};

  if (payload.type !== undefined) data.type = type;
  if (payload.startDate !== undefined) data.startDate = startDate;
  if (payload.endDate !== undefined) data.endDate = endDate;

  return getCycleModel().update({
    where: { id: existing.id },
    data
  });
}

export async function deleteCycle(userId, cycleId) {
  const ownerId = getUserId(userId);
  const existing = await getCycleById(ownerId, cycleId);

  await getCycleModel().delete({
    where: { id: existing.id }
  });

  return {
    id: existing.id,
    deleted: true
  };
}

export async function getCyclePrediction(userId, options = {}) {
  const ownerId = getUserId(userId);
  const requestedLimit = typeof options === 'number'
    ? options
    : Number.parseInt(options.limit, 10);

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 2), 100)
    : MAX_HISTORY;

  const today = getTodayInJakarta();

  // Ambil catatan HAID terbaru dahulu, lalu urutkan ulang
  // secara kronologis sebelum menghitung interval.
  const model = getCycleModel();

  const predictionWhere = {
    userId: ownerId,
    type: 'HAID',
    startDate: { lte: today }
  };

  const [recentCycles, totalRecords] = await prisma.$transaction([
    model.findMany({
      where: predictionWhere,
      orderBy: [
        { startDate: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    }),
    model.count({ where: predictionWhere })
  ]);

  const chronologicalCycles = [...recentCycles].reverse();
  const startDates = chronologicalCycles.map((cycle) => cycle.startDate);
  const cycleLengths = [];

  for (let index = 1; index < startDates.length; index += 1) {
    const length = calculateCycleLength(
      startDates[index - 1],
      startDates[index]
    );

    // Batas ini hanya menyaring interval yang dianggap pencilan
    // untuk prediksi, bukan menghapus atau menolak catatan pengguna.
    if (length >= MIN_CYCLE_LENGTH && length <= MAX_CYCLE_LENGTH) {
      cycleLengths.push(length);
    }
  }

  const recentIntervals = cycleLengths.slice(-MAX_INTERVALS_FOR_AVERAGE);
  const completedCycles = chronologicalCycles
    .filter((cycle) => cycle.endDate)
    .slice(-MAX_INTERVALS_FOR_AVERAGE);

  const periodLengths = completedCycles
    .map((cycle) =>
      calculateCycleLength(cycle.startDate, cycle.endDate) + 1
    )
    .filter((length) => length >= 1 && length <= MAX_HAID_DAYS);

  const averageCycleLength =
    calculateAverage(recentIntervals) ?? DEFAULT_CYCLE_LENGTH;

  const averagePeriodLength = calculateAverage(periodLengths);
  const latestCycle = recentCycles[0] ?? null;

  const nextPeriodStart = latestCycle
    ? addDays(latestCycle.startDate, averageCycleLength)
    : null;

  const nextPeriodEnd = nextPeriodStart
    ? addDays(nextPeriodStart, (averagePeriodLength ?? 5) - 1)
    : null;

  // Perkiraan masa subur dihitung dari estimasi ovulasi,
  // bukan sebagai metode kontrasepsi atau diagnosis.
  const ovulationDate = nextPeriodStart
    ? addDays(nextPeriodStart, -14)
    : null;

  const fertileWindowStart = ovulationDate
    ? addDays(ovulationDate, -5)
    : null;

  const fertileWindowEnd = ovulationDate
    ? addDays(ovulationDate, 1)
    : null;

  const daysUntilNextPeriod = nextPeriodStart
    ? calculateCycleLength(today, nextPeriodStart)
    : null;

  const predictionsAvailable = cycleLengths.length >= 1;

  return {
    totalRecords: recentCycles.length,
    cycleCount: cycleLengths.length,
    averageCycleLength,
    averagePeriodLength,
    lastPeriodStart: latestCycle
      ? formatDate(latestCycle.startDate)
      : null,
    lastPeriodEnd: latestCycle?.endDate
      ? formatDate(latestCycle.endDate)
      : null,
    nextPeriodStart: formatDate(nextPeriodStart),
    nextPeriodEnd: formatDate(nextPeriodEnd),
    fertileWindowStart: formatDate(fertileWindowStart),
    fertileWindowEnd: formatDate(fertileWindowEnd),
    ovulationDate: formatDate(ovulationDate),
    daysUntilNextPeriod,
    predictionsAvailable,
    confidenceLevel: cycleLengths.length >= 5
      ? 'BETTER'
      : cycleLengths.length >= 2
        ? 'LIMITED'
        : 'LOW',
    message: !latestCycle
      ? 'Tambahkan catatan awal HAID untuk mulai membuat perkiraan.'
      : !predictionsAvailable
        ? 'Tambahkan setidaknya dua tanggal awal HAID untuk menghitung interval siklus.'
        : 'Perkiraan berdasarkan riwayat tanggal HAID yang tercatat. Hasil dapat berbeda dari siklus aktual.'
  };
}