import { prisma } from '../lib/prisma.js';

async function ensureVideo(videoId) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, title: true, durationSeconds: true }
  });

  if (!video) {
    const error = new Error('Video tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }

  return video;
}

export async function listVideoChapters(videoId) {
  await ensureVideo(videoId);

  return prisma.videoChapter.findMany({
    where: { videoId },
    orderBy: [
      { order: 'asc' },
      { startSeconds: 'asc' }
    ]
  });
}

export async function createVideoChapter(videoId, data) {
  const video = await ensureVideo(videoId);

  if (
    video.durationSeconds &&
    data.startSeconds >= video.durationSeconds
  ) {
    const error = new Error('Waktu mulai berada di luar durasi video.');
    error.statusCode = 400;
    throw error;
  }

  if (
    data.endSeconds &&
    video.durationSeconds &&
    data.endSeconds > video.durationSeconds
  ) {
    const error = new Error('Waktu selesai melebihi durasi video.');
    error.statusCode = 400;
    throw error;
  }

  return prisma.videoChapter.create({
    data: {
      videoId,
      title: data.title,
      description: data.description ?? null,
      startSeconds: data.startSeconds,
      endSeconds: data.endSeconds ?? null,
      order: data.order ?? 0
    }
  });
}

export async function updateVideoChapter(chapterId, data) {
  const chapter = await prisma.videoChapter.findUnique({
    where: { id: chapterId },
    include: {
      video: {
        select: {
          durationSeconds: true
        }
      }
    }
  });

  if (!chapter) {
    const error = new Error('Chapter tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }

  const startSeconds = data.startSeconds ?? chapter.startSeconds;
  const endSeconds = data.endSeconds !== undefined
    ? data.endSeconds
    : chapter.endSeconds;

  if (endSeconds !== null && endSeconds <= startSeconds) {
    const error = new Error('Waktu selesai harus lebih besar dari waktu mulai.');
    error.statusCode = 400;
    throw error;
  }

  if (
    chapter.video.durationSeconds &&
    startSeconds >= chapter.video.durationSeconds
  ) {
    const error = new Error('Waktu mulai berada di luar durasi video.');
    error.statusCode = 400;
    throw error;
  }

  if (
    endSeconds &&
    chapter.video.durationSeconds &&
    endSeconds > chapter.video.durationSeconds
  ) {
    const error = new Error('Waktu selesai melebihi durasi video.');
    error.statusCode = 400;
    throw error;
  }

  return prisma.videoChapter.update({
    where: { id: chapterId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.startSeconds !== undefined && { startSeconds: data.startSeconds }),
      ...(data.endSeconds !== undefined && { endSeconds: data.endSeconds }),
      ...(data.order !== undefined && { order: data.order })
    }
  });
}

export async function deleteVideoChapter(chapterId) {
  const chapter = await prisma.videoChapter.findUnique({
    where: { id: chapterId },
    select: { id: true }
  });

  if (!chapter) {
    const error = new Error('Chapter tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }

  await prisma.videoChapter.delete({
    where: { id: chapterId }
  });

  return { id: chapterId };
}