import { z } from 'zod';

const MAX_INT = 2_147_483_647;

export const quizStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
]);

const optionalText = z.string()
  .trim()
  .max(5000, 'Teks maksimal 5000 karakter.')
  .nullable()
  .optional();

const nullablePositiveInt = z.number()
  .int('Nilai harus berupa bilangan bulat.')
  .positive('Nilai harus lebih dari 0.')
  .max(MAX_INT, 'Nilai terlalu besar.')
  .nullable()
  .optional();

const nonNegativeInt = (label) => z.number()
  .int(`${label} harus berupa bilangan bulat.`)
  .min(0, `${label} tidak boleh negatif.`)
  .max(MAX_INT, `${label} terlalu besar.`);

const optionalQuizStatus = z.preprocess(
  (value) => typeof value === 'string' && !value.trim()
    ? undefined
    : value,
  quizStatusSchema.optional()
);

const optionalMaterialId = z.preprocess(
  (value) => typeof value === 'string' && !value.trim()
    ? undefined
    : value,
  z.string()
    .trim()
    .min(1, 'ID materi tidak boleh kosong.')
    .max(191, 'ID materi terlalu panjang.')
    .optional()
);

const scheduledAtSchema = z.iso.datetime({
  offset: true,
  error: 'Format tanggal publikasi tidak valid.'
}).nullable().optional();

export const quizCreateSchema = z.object({
  materialId: z.string()
    .trim()
    .min(1, 'Materi wajib dipilih.')
    .max(191, 'ID materi terlalu panjang.'),

  title: z.string()
    .trim()
    .min(3, 'Judul minimal 3 karakter.')
    .max(200, 'Judul maksimal 200 karakter.'),

  description: optionalText,

  passingScore: z.number()
    .int('Nilai kelulusan harus berupa bilangan bulat.')
    .min(0, 'Nilai kelulusan minimal 0.')
    .max(100, 'Nilai kelulusan maksimal 100.')
    .optional(),

  xpPerCorrect: nonNegativeInt('XP per jawaban benar').optional(),

  order: nonNegativeInt('Urutan kuis').optional(),

  maxAttempts: nullablePositiveInt,

  showExplanation: z.boolean().optional(),

  shuffleQuestions: z.boolean().optional(),

  timeLimitSeconds: nullablePositiveInt,

  scheduledAt: scheduledAtSchema
});

export const quizUpdateSchema = quizCreateSchema
  .partial()
  .omit({
    materialId: true
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    {
      message: 'Minimal satu field harus diisi.'
    }
  );

export const quizListSchema = z.object({
  page: z.coerce.number()
    .int('Halaman harus berupa bilangan bulat.')
    .min(1, 'Halaman minimal 1.')
    .default(1),

  limit: z.coerce.number()
    .int('Limit harus berupa bilangan bulat.')
    .min(1, 'Limit minimal 1.')
    .max(100, 'Limit maksimal 100.')
    .default(10),

  search: z.string()
    .trim()
    .max(200, 'Pencarian maksimal 200 karakter.')
    .optional(),

  status: optionalQuizStatus,

  materialId: optionalMaterialId,

  sortBy: z.enum([
    'createdAt',
    'updatedAt',
    'title',
    'order',
    'publishedAt'
  ]).default('createdAt'),

  sortOrder: z.enum([
    'asc',
    'desc'
  ]).default('desc')
});

export const quizPublishSchema = z.object({
  changeNote: z.string()
    .trim()
    .max(1000, 'Catatan publikasi maksimal 1000 karakter.')
    .optional()
});

export const quizIdParamsSchema = z.object({
  quizId: z.string()
    .trim()
    .min(1, 'ID kuis tidak valid.')
    .max(191, 'ID kuis terlalu panjang.')
});