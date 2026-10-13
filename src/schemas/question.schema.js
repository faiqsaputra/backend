
import { z } from 'zod';

const questionOptionSchema = z.object({
  label: z.string().trim().min(1, 'Label opsi wajib diisi').max(500),
  value: z.string().trim().min(1, 'Value opsi wajib diisi').max(200),
  isCorrect: z.boolean().optional().default(false),
  order: z.number().int().min(0).optional()
});

const questionFields = {
  type: z.string().trim().min(1, 'Tipe soal wajib diisi'),
  title: z.string().trim().max(200).nullable().optional(),
  question: z.string().trim().min(1, 'Pertanyaan wajib diisi').max(10000),
  content: z.unknown().nullable().optional(),
  answer: z.record(z.string(), z.unknown()),
  explanation: z.string().trim().max(10000).nullable().optional(),
  points: z.number().int().min(1).optional(),
  order: z.number().int().min(0).optional(),
  options: z.array(questionOptionSchema).optional()
};

function validateQuestionOptions(data, ctx) {
  if (!data.options) return;

  const values = data.options.map(option => option.value);

  if (new Set(values).size !== values.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'Value setiap opsi harus unik'
    });
  }
}

export const questionCreateSchema = z.object(questionFields)
  .superRefine(validateQuestionOptions);

export const questionUpdateSchema = z.object(questionFields)
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diisi'
  })
  .superRefine(validateQuestionOptions);

export const questionReorderSchema = z.object({
  questionIds: z.array(z.string().trim().min(1)).min(1, 'Daftar soal tidak boleh kosong')
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'ID soal tidak boleh duplikat'
    })
});

export const questionIdParamsSchema = z.object({
  quizId: z.string().trim().min(1),
  questionId: z.string().trim().min(1)
});
