import { z } from 'zod';

const statusSchema = z.enum([
  'DRAFT',
  'REVIEW',
  'PUBLISHED',
  'ARCHIVED'
]);

export const materialListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  status: statusSchema.optional()
});

export const publicMaterialListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional()
});

export const materialCreateSchema = z.object({
  title: z.string().trim().min(3, 'Judul minimal 3 karakter.').max(200, 'Judul terlalu panjang.'),
  slug: z.string().trim().min(3, 'Slug minimal 3 karakter.').max(220, 'Slug terlalu panjang.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung.'),
  description: z.string().trim().max(500, 'Deskripsi terlalu panjang.').optional(),
  excerpt: z.string().trim().max(500, 'Excerpt terlalu panjang.').optional(),
  content: z.string().trim().min(1, 'Konten tidak boleh kosong.'),
  coverImage: z.string().trim().url('URL cover tidak valid.').optional().or(z.literal('')),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  status: statusSchema.default('DRAFT'),
  quizRequired: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  readTimeMinutes: z.coerce.number().int().min(1).max(999).optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional()
});

export const materialUpdateSchema = materialCreateSchema.partial();

export const materialStatusSchema = z.object({
  status: statusSchema
});