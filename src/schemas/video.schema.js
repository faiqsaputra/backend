import { z } from 'zod';

const videoStatus = z.enum([
  'DRAFT',
  'REVIEW',
  'PUBLISHED',
  'ARCHIVED'
]);

const queryBoolean = z.preprocess(value => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }

  return value;
}, z.boolean().optional());

export const videoListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
  status: videoStatus.optional()
});

export const publicVideoListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
  featured: queryBoolean
});

export const videoCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),

  slug: z.string()
    .trim()
    .min(3)
    .max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),

  description: z.string()
    .trim()
    .max(1000)
    .nullable()
    .optional(),

  url: z.string().trim().url(),

  thumbnailUrl: z.union([
    z.string().trim().url(),
    z.literal(''),
    z.null()
  ]).optional(),

  order: z.coerce.number()
    .int()
    .min(0)
    .max(9999)
    .default(0),

  status: videoStatus.default('DRAFT'),

  isFeatured: z.boolean().default(false),

  seoTitle: z.string()
    .trim()
    .max(200)
    .nullable()
    .optional(),

  seoDescription: z.string()
    .trim()
    .max(500)
    .nullable()
    .optional(),

  scheduledAt: z.coerce.date()
    .nullable()
    .optional()
});

export const videoUpdateSchema = videoCreateSchema.partial();

export const videoStatusSchema = z.object({
  status: videoStatus
});