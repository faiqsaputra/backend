import { prisma } from '../lib/prisma.js';
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  normalizeYouTubeUrl
} from '../utils/youtube.js';

function parseYouTubeUrl(value) {
  let externalId = null;

  try {
    externalId = extractYouTubeId(value);
  } catch {
    externalId = null;
  }

  if (
    typeof externalId !== 'string' ||
    !/^[A-Za-z0-9_-]{11}$/.test(externalId)
  ) {
    const error = new Error(
      'URL YouTube tidak valid. Periksa kembali tautan video.'
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    provider: 'YOUTUBE',
    externalId,
    url: normalizeYouTubeUrl(externalId),
    thumbnailUrl: getYouTubeThumbnail(externalId)
  };
}

const adminListSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  provider: true,
  externalId: true,
  url: true,
  thumbnailUrl: true,
  durationSeconds: true,
  order: true,
  status: true,
  isFeatured: true,
  contentVersion: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      chapters: true,
      interactions: true,
      resources: true
    }
  }
};

const adminDetailSelect = {
  ...adminListSelect,
  seoTitle: true,
  seoDescription: true,
  scheduledAt: true,
  authorId: true,
  updatedById: true,
  publishedById: true,
  transcript: true,
  chapters: {
    orderBy: { order: 'asc' }
  },
  interactions: {
    orderBy: [
      { timestampSeconds: 'asc' },
      { order: 'asc' }
    ]
  },
  resources: {
    orderBy: [
      { order: 'asc' },
      { timestampSeconds: 'asc' }
    ]
  }
};

const publicListSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  provider: true,
  externalId: true,
  thumbnailUrl: true,
  durationSeconds: true,
  order: true,
  isFeatured: true,
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
  _count: {
    select: {
      chapters: true,
      interactions: true,
      resources: true
    }
  }
};

const publicDetailSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  provider: true,
  externalId: true,
  thumbnailUrl: true,
  durationSeconds: true,
  order: true,
  isFeatured: true,
  publishedAt: true,
  transcript: true,
  chapters: {
    orderBy: { order: 'asc' }
  },
  interactions: {
    where: {
      active: true
    },
    orderBy: [
      { timestampSeconds: 'asc' },
      { order: 'asc' }
    ]
  },
  resources: {
    orderBy: [
      { order: 'asc' },
      { timestampSeconds: 'asc' }
    ]
  },
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

function getPublishedCondition() {
  const now = new Date();

  return {
    status: 'PUBLISHED',
    OR: [
      { scheduledAt: null },
      { scheduledAt: { lte: now } }
    ]
  };
}

function getRevisionStatus(status) {
  return status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
}

function getPublishedAt(status, currentStatus, currentPublishedAt) {
  if (status !== 'PUBLISHED') return null;

  if (currentStatus === 'PUBLISHED' && currentPublishedAt) {
    return undefined;
  }

  return new Date();
}

export async function listAdminVideos({
  page,
  limit,
  search,
  status
}) {
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
    prisma.video.findMany({
      where,
      select: adminListSelect,
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.video.count({ where })
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

export async function getAdminVideoById(id) {
  return prisma.video.findUnique({
    where: { id },
    select: adminDetailSelect
  });
}

export async function getVideoStats() {
  const [total, draft, review, published, archived] =
    await Promise.all([
      prisma.video.count(),
      prisma.video.count({ where: { status: 'DRAFT' } }),
      prisma.video.count({ where: { status: 'REVIEW' } }),
      prisma.video.count({ where: { status: 'PUBLISHED' } }),
      prisma.video.count({ where: { status: 'ARCHIVED' } })
    ]);

  return {
    total,
    draft,
    review,
    published,
    archived
  };
}

export async function createVideo(data, actorId) {
  const youtube = parseYouTubeUrl(data.url);
  const status = data.status || 'DRAFT';
  const scheduledAt = data.scheduledAt || null;

  const shouldPublishNow = status === 'PUBLISHED' && (
    !scheduledAt || new Date(scheduledAt) <= new Date()
  );

  const publishedAt = shouldPublishNow ? new Date() : null;

  return prisma.$transaction(async tx => {
    const video = await tx.video.create({
      data: {
        title: data.title,
        slug: data.slug,
        description: data.description || null,
        provider: youtube.provider,
        externalId: youtube.externalId,
        url: youtube.url,
        thumbnailUrl: data.thumbnailUrl || youtube.thumbnailUrl,
        durationSeconds: data.durationSeconds ?? null,
        order: data.order ?? 0,
        status,
        isFeatured: data.isFeatured ?? false,
        contentVersion: 1,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        scheduledAt,
        publishedAt,
        authorId: actorId,
        updatedById: actorId,
        publishedById: shouldPublishNow ? actorId : null
      },
      select: {
        ...adminListSelect,
        contentVersion: true
      }
    });

    await tx.videoRevision.create({
      data: {
        videoId: video.id,
        version: 1,
        title: data.title,
        description: data.description || null,
        provider: youtube.provider,
        externalId: youtube.externalId,
        url: youtube.url,
        thumbnailUrl: data.thumbnailUrl || youtube.thumbnailUrl,
        durationSeconds: data.durationSeconds ?? null,
        status: getRevisionStatus(status),
        changeNote: 'Initial video',
        createdById: actorId
      }
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'CREATE',
        entity: 'Video',
        entityId: video.id,
        afterData: {
          title: video.title,
          status: video.status,
          scheduledAt: video.scheduledAt
        }
      }
    });

    return video;
  });
}

export async function updateVideo(id, data, actorId) {
  const current = await prisma.video.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      provider: true,
      externalId: true,
      url: true,
      thumbnailUrl: true,
      durationSeconds: true,
      status: true,
      contentVersion: true,
      scheduledAt: true,
      publishedAt: true,
      order: true,
      isFeatured: true,
      seoTitle: true,
      seoDescription: true,
      slug: true
    }
  });

  if (!current) return null;

  let youtube = null;

  if (data.url) {
    youtube = parseYouTubeUrl(data.url);
  }

  const nextVersion = current.contentVersion + 1;
  const nextStatus = data.status ?? current.status;

  const nextScheduledAt = data.scheduledAt !== undefined
    ? data.scheduledAt || null
    : current.scheduledAt;

  const nextProvider = youtube?.provider ?? current.provider;
  const nextExternalId = youtube?.externalId ?? current.externalId;
  const nextUrl = youtube?.url ?? current.url;

  const nextThumbnail = data.thumbnailUrl !== undefined
    ? data.thumbnailUrl || null
    : youtube?.thumbnailUrl ?? current.thumbnailUrl;

  const shouldPublishNow = nextStatus === 'PUBLISHED' && (
    !nextScheduledAt || new Date(nextScheduledAt) <= new Date()
  );

  const publishedAt = shouldPublishNow
    ? current.status === 'PUBLISHED' && current.publishedAt
      ? undefined
      : new Date()
    : null;

  return prisma.$transaction(async tx => {
    const video = await tx.video.update({
      where: { id },
      data: {
        title: data.title ?? undefined,
        slug: data.slug ?? undefined,
        description: data.description !== undefined
          ? data.description || null
          : undefined,
        provider: nextProvider,
        externalId: nextExternalId,
        url: nextUrl,
        thumbnailUrl: nextThumbnail,
        durationSeconds: data.durationSeconds !== undefined
          ? data.durationSeconds
          : undefined,
        order: data.order !== undefined
          ? data.order
          : undefined,
        status: nextStatus,
        isFeatured: data.isFeatured !== undefined
          ? data.isFeatured
          : undefined,
        seoTitle: data.seoTitle !== undefined
          ? data.seoTitle || null
          : undefined,
        seoDescription: data.seoDescription !== undefined
          ? data.seoDescription || null
          : undefined,
        scheduledAt: nextScheduledAt,
        contentVersion: nextVersion,
        updatedById: actorId,
        publishedById: shouldPublishNow ? actorId : null,
        ...(publishedAt !== undefined ? { publishedAt } : {})
      },
      select: adminDetailSelect
    });

    await tx.videoRevision.create({
      data: {
        videoId: video.id,
        version: nextVersion,
        title: video.title,
        description: video.description,
        provider: video.provider,
        externalId: video.externalId,
        url: video.url,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        status: getRevisionStatus(video.status),
        changeNote: 'Video updated',
        createdById: actorId
      }
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'UPDATE',
        entity: 'Video',
        entityId: video.id,
        beforeData: {
          title: current.title,
          status: current.status,
          version: current.contentVersion,
          scheduledAt: current.scheduledAt
        },
        afterData: {
          title: video.title,
          status: video.status,
          version: video.contentVersion,
          scheduledAt: video.scheduledAt
        }
      }
    });

    return video;
  });
}

export async function updateVideoStatus(id, status, actorId) {
  const current = await prisma.video.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      scheduledAt: true
    }
  });

  if (!current) return null;

  const shouldPublishNow = status === 'PUBLISHED' && (
    !current.scheduledAt || new Date(current.scheduledAt) <= new Date()
  );

  const publishedAt = shouldPublishNow
    ? current.publishedAt || new Date()
    : null;

  return prisma.$transaction(async tx => {
    const video = await tx.video.update({
      where: { id },
      data: {
        status,
        updatedById: actorId,
        publishedById: shouldPublishNow ? actorId : null,
        publishedAt
      },
      select: adminDetailSelect
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'STATUS_CHANGED',
        entity: 'Video',
        entityId: id,
        beforeData: {
          status: current.status
        },
        afterData: {
          status,
          scheduledAt: current.scheduledAt
        }
      }
    });

    if (status === 'PUBLISHED') {
      await tx.videoRevision.updateMany({
        where: {
          videoId: id,
          status: 'DRAFT'
        },
        data: {
          status: 'PUBLISHED'
        }
      });
    }

    return video;
  });
}

export async function archiveVideo(id, actorId) {
  const video = await prisma.video.findUnique({
    where: { id },
    select: {
      id: true,
      status: true
    }
  });

  if (!video) return null;

  return prisma.$transaction(async tx => {
    const archived = await tx.video.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        publishedAt: null,
        publishedById: null,
        scheduledAt: null,
        updatedById: actorId
      },
      select: adminListSelect
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'ARCHIVE',
        entity: 'Video',
        entityId: id,
        beforeData: {
          status: video.status
        },
        afterData: {
          status: 'ARCHIVED'
        }
      }
    });

    return archived;
  });
}

export async function createChapter(videoId, data) {
  return prisma.videoChapter.create({
    data: {
      videoId,
      title: data.title,
      description: data.description || null,
      startSeconds: data.startSeconds,
      endSeconds: data.endSeconds ?? null,
      order: data.order ?? 0
    }
  });
}

export async function updateChapter(id, data) {
  return prisma.videoChapter.update({
    where: { id },
    data: {
      title: data.title !== undefined ? data.title : undefined,
      description: data.description !== undefined
        ? data.description || null
        : undefined,
      startSeconds: data.startSeconds !== undefined
        ? data.startSeconds
        : undefined,
      endSeconds: data.endSeconds !== undefined
        ? data.endSeconds
        : undefined,
      order: data.order !== undefined
        ? data.order
        : undefined
    }
  });
}

export async function deleteChapter(id) {
  return prisma.videoChapter.delete({
    where: { id }
  });
}

export async function createInteraction(videoId, data) {
  return prisma.videoInteraction.create({
    data: {
      videoId,
      type: data.type,
      title: data.title,
      description: data.description || null,
      timestampSeconds: data.timestampSeconds,
      durationSeconds: data.durationSeconds ?? null,
      action: data.action || 'PAUSE',
      required: data.required ?? false,
      active: data.active ?? true,
      order: data.order ?? 0,
      payload: data.payload ?? null
    }
  });
}

export async function updateInteraction(id, data) {
  return prisma.videoInteraction.update({
    where: { id },
    data: {
      type: data.type !== undefined ? data.type : undefined,
      title: data.title !== undefined ? data.title : undefined,
      description: data.description !== undefined
        ? data.description || null
        : undefined,
      timestampSeconds: data.timestampSeconds !== undefined
        ? data.timestampSeconds
        : undefined,
      durationSeconds: data.durationSeconds !== undefined
        ? data.durationSeconds
        : undefined,
      action: data.action !== undefined
        ? data.action
        : undefined,
      required: data.required !== undefined
        ? data.required
        : undefined,
      active: data.active !== undefined
        ? data.active
        : undefined,
      order: data.order !== undefined
        ? data.order
        : undefined,
      payload: data.payload !== undefined
        ? data.payload
        : undefined
    }
  });
}

export async function deleteInteraction(id) {
  return prisma.videoInteraction.delete({
    where: { id }
  });
}

export async function createResource(videoId, data) {
  return prisma.videoResource.create({
    data: {
      videoId,
      title: data.title,
      description: data.description || null,
      url: data.url,
      type: data.type,
      timestampSeconds: data.timestampSeconds ?? null,
      order: data.order ?? 0
    }
  });
}

export async function updateResource(id, data) {
  return prisma.videoResource.update({
    where: { id },
    data: {
      title: data.title !== undefined
        ? data.title
        : undefined,
      description: data.description !== undefined
        ? data.description || null
        : undefined,
      url: data.url !== undefined
        ? data.url
        : undefined,
      type: data.type !== undefined
        ? data.type
        : undefined,
      timestampSeconds: data.timestampSeconds !== undefined
        ? data.timestampSeconds
        : undefined,
      order: data.order !== undefined
        ? data.order
        : undefined
    }
  });
}

export async function deleteResource(id) {
  return prisma.videoResource.delete({
    where: { id }
  });
}

export async function listPublishedVideos({
  page,
  limit,
  search,
  category
}) {
  const where = getPublishedCondition();

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
    prisma.video.findMany({
      where,
      select: publicListSelect,
      orderBy: [
        { order: 'asc' },
        { publishedAt: 'desc' }
      ],
      skip,
      take: limit
    }),
    prisma.video.count({ where })
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

export async function getPublishedVideoBySlug(slug) {
  return prisma.video.findFirst({
    where: {
      slug,
      ...getPublishedCondition()
    },
    select: publicDetailSelect
  });
}

export async function saveVideoProgress(userId, slug, data) {
  const video = await prisma.video.findFirst({
    where: {
      slug,
      ...getPublishedCondition()
    },
    select: {
      id: true,
      durationSeconds: true
    }
  });

  if (!video) return null;

  const progress = Math.max(
    0,
    Math.min(100, Number(data.progress) || 0)
  );

  const lastPosition = Math.max(
    0,
    Number(data.lastPosition) || 0
  );

  const watched = progress >= 90;

  return prisma.videoProgress.upsert({
    where: {
      userId_videoId: {
        userId,
        videoId: video.id
      }
    },
    create: {
      userId,
      videoId: video.id,
      watched,
      progress,
      lastPosition,
      completedAt: watched ? new Date() : null
    },
    update: {
      watched,
      progress,
      lastPosition,
      completedAt: watched ? new Date() : undefined
    }
  });
}