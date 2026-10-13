import { z } from 'zod';

const videoStatus = z.enum([
  'DRAFT',
  'REVIEW',
  'PUBLISHED',
  'ARCHIVED'
]);

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
  featured: z.coerce.boolean().optional()
});

export const videoCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().min(3).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1000).optional(),
  url: z.string().trim().url(),
  thumbnailUrl: z.string().trim().url().optional().or(z.literal('')),
  order: z.coerce.number().int().min(0).max(9999).default(0),
  status: videoStatus.default('DRAFT'),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  scheduledAt: z.coerce.date().optional().nullable()
});

export const videoUpdateSchema = videoCreateSchema.partial();

export const videoStatusSchema = z.object({
  status: videoStatus
});