import { z } from 'zod';

const startSecondsSchema = z.preprocess(
  value => value === '' || value === null ? undefined : value,
  z.coerce.number({
    error: 'Waktu mulai wajib diisi dengan angka.'
  }).int('Waktu mulai harus berupa bilangan bulat.').min(
    0,
    'Waktu mulai tidak boleh negatif.'
  )
);

const endSecondsSchema = z.preprocess(
  value => value === '' ? null : value,
  z.coerce.number({
    error: 'Waktu selesai harus berupa angka.'
  }).int('Waktu selesai harus berupa bilangan bulat.').min(
    1,
    'Waktu selesai minimal 1 detik.'
  ).nullable().optional()
);

const videoChapterFields = {
  title: z.string()
    .trim()
    .min(1, 'Judul chapter wajib diisi.')
    .max(150, 'Judul chapter maksimal 150 karakter.'),

  description: z.string()
    .trim()
    .max(500, 'Deskripsi maksimal 500 karakter.')
    .nullable()
    .optional(),

  startSeconds: startSecondsSchema,

  endSeconds: endSecondsSchema,

  order: z.coerce.number()
    .int('Urutan harus berupa bilangan bulat.')
    .min(0, 'Urutan tidak boleh negatif.')
    .default(0)
};

const validateChapterTime = (data, ctx) => {
  if (
    data.startSeconds !== undefined &&
    data.startSeconds !== null &&
    data.endSeconds !== undefined &&
    data.endSeconds !== null &&
    data.endSeconds <= data.startSeconds
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSeconds'],
      message: 'Waktu selesai harus lebih besar dari waktu mulai.'
    });
  }
};

export const createVideoChapterSchema = z
  .object(videoChapterFields)
  .superRefine(validateChapterTime);

export const updateVideoChapterSchema = z
  .object(videoChapterFields)
  .partial()
  .superRefine(validateChapterTime);

export const chapterIdSchema = z.object({
  videoId: z.string().trim().min(1, 'Video ID wajib diisi.'),
  chapterId: z.string().trim().min(1, 'Chapter ID wajib diisi.')
});