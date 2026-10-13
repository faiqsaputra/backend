import { z } from 'zod';

const videoChapterFields = {
  title: z.string().trim().min(1, 'Judul chapter wajib diisi.').max(150),
  description: z.string().trim().max(500).optional().nullable(),
  startSeconds: z.coerce.number().int().min(0),
  endSeconds: z.coerce.number().int().min(1).optional().nullable(),
  order: z.coerce.number().int().min(0).default(0)
};

const validateChapterTime = (data, ctx) => {
  if (data.endSeconds !== null && data.endSeconds !== undefined && data.endSeconds <= data.startSeconds) {
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
  videoId: z.string().min(1),
  chapterId: z.string().min(1)
});