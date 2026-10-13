import { z } from 'zod';

const RECORD_TYPES = ['HAID', 'NIFAS', 'ISTIHADHAH'];
const MAX_HAID_DAYS = 15;
const MAX_NIFAS_DAYS = 60;

const recordTypeSchema = z.enum(RECORD_TYPES);

const dateSchema = z.string()
  .trim()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value;
  }, 'Tanggal harus valid dengan format YYYY-MM-DD');

const endDateSchema = dateSchema.nullable().optional();

function validateDateRange(data, ctx, validateDuration = true) {
  if (!data.startDate || !data.endDate) return;

  const startDate = new Date(`${data.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${data.endDate}T00:00:00.000Z`);

  if (endDate < startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'Tanggal selesai tidak boleh sebelum tanggal mulai'
    });
    return;
  }

  if (!validateDuration) return;

  const duration = Math.floor(
    (endDate.getTime() - startDate.getTime()) / 86400000
  ) + 1;

  const maxDuration = data.type === 'HAID'
    ? MAX_HAID_DAYS
    : data.type === 'NIFAS'
      ? MAX_NIFAS_DAYS
      : null;

  if (maxDuration !== null && duration > maxDuration) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: `Durasi ${data.type} tidak boleh melebihi ${maxDuration} hari`
    });
  }
}

export const createCycleSchema = z.object({
  type: recordTypeSchema.default('HAID'),
  startDate: dateSchema,
  endDate: endDateSchema
}).strict().superRefine((data, ctx) => {
  validateDateRange(data, ctx);
});

export const updateCycleSchema = z.object({
  type: recordTypeSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: endDateSchema
}).strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diubah'
  })
  .superRefine((data, ctx) => {
    // Type bisa tidak dikirim ketika pengguna memperbarui
    // catatan yang sudah memiliki tipe di database.
    validateDateRange(data, ctx, data.type !== undefined);
  });

export const cycleListSchema = z.object({
  type: recordTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

export const cyclePredictionSchema = z.object({
  limit: z.coerce.number().int().min(2).max(100).default(24)
}).strict();

export const cycleIdSchema = z.object({
  id: z.string().trim().min(1, 'ID catatan wajib diisi')
}).strict();