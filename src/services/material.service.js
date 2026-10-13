import { prisma } from '../lib/prisma.js';

const adminListSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  excerpt: true,
  coverImage: true,
  order: true,
  status: true,
  quizRequired: true,
  isFeatured: true,
  readTimeMinutes: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true
};

const adminDetailSelect = {
  ...adminListSelect,
  content: true,
  seoTitle: true,
  seoDescription: true,
  scheduledAt: true,
  authorId: true,
  updatedById: true,
  publishedById: true
};

const publicListSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  excerpt: true,
  coverImage: true,
  order: true,
  quizRequired: true,
  isFeatured: true,
  readTimeMinutes: true,
  publishedAt: true,
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  }
};

const publicDetailSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  excerpt: true,
  content: true,
  coverImage: true,
  order: true,
  quizRequired: true,
  isFeatured: true,
  readTimeMinutes: true,
  publishedAt: true,
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  },
  quiz: {
    select: {
      id: true,
      title: true,
      description: true,
      passingScore: true,
      status: true
    }
  }
};

export async function listAdminMaterials({ page, limit, search, status }) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      {
        title: {
          contains: search,
          mode: 'insensitive'
        }
      },
      {
        slug: {
          contains: search,
          mode: 'insensitive'
        }
      },
      {
        description: {
          contains: search,
          mode: 'insensitive'
        }
      }
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.material.findMany({
      where,
      select: adminListSelect,
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.material.count({ where })
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getAdminMaterialById(id) {
  return prisma.material.findUnique({
    where: { id },
    select: adminDetailSelect
  });
}

export async function getMaterialStats() {
  const [total, draft, review, published, archived] = await Promise.all([
    prisma.material.count(),
    prisma.material.count({
      where: { status: 'DRAFT' }
    }),
    prisma.material.count({
      where: { status: 'REVIEW' }
    }),
    prisma.material.count({
      where: { status: 'PUBLISHED' }
    }),
    prisma.material.count({
      where: { status: 'ARCHIVED' }
    })
  ]);

  return {
    total,
    draft,
    review,
    published,
    archived
  };
}

export async function createMaterial(data, actorId) {
  const publishedAt = data.status === 'PUBLISHED'
    ? new Date()
    : null;

  return prisma.material.create({
    data: {
      title: data.title,
      slug: data.slug,
      description: data.description || null,
      excerpt: data.excerpt || null,
      content: data.content,
      coverImage: data.coverImage || null,
      order: data.order ?? 0,
      status: data.status ?? 'DRAFT',
      quizRequired: data.quizRequired ?? true,
      isFeatured: data.isFeatured ?? false,
      readTimeMinutes: data.readTimeMinutes ?? null,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      authorId: actorId,
      updatedById: actorId,
      publishedById: data.status === 'PUBLISHED' ? actorId : null,
      publishedAt
    },
    select: adminDetailSelect
  });
}

export async function updateMaterial(id, data, actorId) {
  const current = await prisma.material.findUnique({
    where: { id },
    select: {
      status: true
    }
  });

  if (!current) {
    return null;
  }

  const nextStatus = data.status ?? current.status;

  let publishedAt;
  let publishedById;

  if (nextStatus === 'PUBLISHED') {
    publishedAt = current.status === 'PUBLISHED'
      ? undefined
      : new Date();

    publishedById = current.status === 'PUBLISHED'
      ? undefined
      : actorId;
  } else {
    publishedAt = null;
    publishedById = null;
  }

  return prisma.material.update({
    where: { id },
    data: {
      ...data,
      description: data.description !== undefined
        ? data.description || null
        : undefined,
      excerpt: data.excerpt !== undefined
        ? data.excerpt || null
        : undefined,
      coverImage: data.coverImage !== undefined
        ? data.coverImage || null
        : undefined,
      seoTitle: data.seoTitle !== undefined
        ? data.seoTitle || null
        : undefined,
      seoDescription: data.seoDescription !== undefined
        ? data.seoDescription || null
        : undefined,
      updatedById: actorId,
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(publishedById !== undefined ? { publishedById } : {})
    },
    select: adminDetailSelect
  });
}

export async function updateMaterialStatus(id, status, actorId) {
  const current = await prisma.material.findUnique({
    where: { id },
    select: {
      status: true,
      publishedAt: true
    }
  });

  if (!current) {
    return null;
  }

  const isPublishing = status === 'PUBLISHED';

  return prisma.material.update({
    where: { id },
    data: {
      status,
      updatedById: actorId,
      publishedAt: isPublishing
        ? current.publishedAt || new Date()
        : null,
      publishedById: isPublishing
        ? actorId
        : null
    },
    select: adminDetailSelect
  });
}

export async function archiveMaterial(id, actorId) {
  const material = await prisma.material.findUnique({
    where: { id },
    select: {
      id: true
    }
  });

  if (!material) {
    return null;
  }

  return prisma.material.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      publishedAt: null,
      publishedById: null,
      updatedById: actorId
    },
    select: adminListSelect
  });
}

export async function listPublishedMaterials({ page, limit, search, category }) {
  const where = {
    status: 'PUBLISHED',
    OR: [
      {
        publishedAt: null
      },
      {
        publishedAt: {
          lte: new Date()
        }
      }
    ]
  };

  if (search) {
    where.AND = [
      {
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive'
            }
          },
          {
            description: {
              contains: search,
              mode: 'insensitive'
            }
          },
          {
            excerpt: {
              contains: search,
              mode: 'insensitive'
            }
          }
        ]
      }
    ];
  }

  if (category) {
    where.categories = {
      some: {
        category: {
          slug: category
        }
      }
    };
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.material.findMany({
      where,
      select: publicListSelect,
      orderBy: [
        { order: 'asc' },
        { publishedAt: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.material.count({ where })
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getPublishedMaterialBySlug(slug) {
  return prisma.material.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
      OR: [
        {
          publishedAt: null
        },
        {
          publishedAt: {
            lte: new Date()
          }
        }
      ]
    },
    select: publicDetailSelect
  });
}