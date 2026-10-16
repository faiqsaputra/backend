import { z } from 'zod';

/**
 * Schema untuk memulai attempt.
 *
 * Payload boleh kosong.
 * userId TIDAK dikirim dari frontend karena diambil
 * dari token Supabase melalui req.auth.userId.
 */
export const startQuizAttemptSchema = z.object({}).strict();

/**
 * Schema jawaban.
 *
 * answer dibuat fleksibel karena Question.type bisa berbeda:
 * - SINGLE_CHOICE
 * - MULTIPLE_CHOICE
 * - TRUE_FALSE
 * - TEXT
 * - MATCHING
 * - dll.
 *
 * Validasi struktur jawaban dilakukan di service
 * berdasarkan tipe question.
 */
export const submitQuizAnswerSchema = z.object({
  answer: z.any()
});

/**
 * Schema ketika menyelesaikan attempt.
 *
 * Payload sebenarnya opsional.
 * Client tidak wajib mengirim score.
 *
 * Score HARUS dihitung backend.
 */
export const completeQuizAttemptSchema = z.object({}).strict();