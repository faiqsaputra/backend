import {
  publicVideoListSchema,
  videoCreateSchema,
  videoListSchema,
  videoStatusSchema,
  videoUpdateSchema
} from '../schemas/video.schema.js';

import {
  archiveVideo,
  createVideo,
  getAdminVideoById,
  getPublishedVideoBySlug,
  listAdminVideos,
  listPublishedVideos,
  updateVideo,
  updateVideoStatus
} from '../services/video.service.js';

function getErrorStatus(error, fallback = 500) {
  if (Number.isInteger(error?.statusCode)) {
    return error.statusCode;
  }

  if (error?.code === 'P2002') {
    return 409;
  }

  return fallback;
}

export async function listAdminVideosController(req, res) {
  try {
    const parsed = videoListSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Parameter tidak valid.'
      });
    }

    const data = await listAdminVideos(parsed.data);

    return res.status(200).json({
      success: true,
      data: {
        items: Array.isArray(data?.items) ? data.items : [],
        pagination: data?.pagination || {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total: 0,
          totalPages: 0
        }
      }
    });
  } catch (error) {
    console.error('GET /api/admin/videos:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal memuat video.'
    });
  }
}

export async function getAdminVideoController(req, res) {
  try {
    const video = await getAdminVideoById(req.params.id);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      data: video
    });
  } catch (error) {
    console.error('GET /api/admin/videos/:id:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal memuat video.'
    });
  }
}

export async function createVideoController(req, res) {
  try {
    const parsed = videoCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Data video tidak valid.'
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Identitas admin tidak ditemukan.'
      });
    }

    const video = await createVideo(
      parsed.data,
      req.user.id
    );

    return res.status(201).json({
      success: true,
      message: 'Video berhasil dibuat.',
      data: video
    });
  } catch (error) {
    console.error('POST /api/admin/videos:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Slug video sudah digunakan.'
      });
    }

    return res.status(getErrorStatus(error, 400)).json({
      success: false,
      message: error.message || 'Gagal membuat video.'
    });
  }
}

export async function updateVideoController(req, res) {
  try {
    const parsed = videoUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Data video tidak valid.'
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Identitas admin tidak ditemukan.'
      });
    }

    const video = await updateVideo(
      req.params.id,
      parsed.data,
      req.user.id
    );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Video berhasil diperbarui.',
      data: video
    });
  } catch (error) {
    console.error('PATCH /api/admin/videos/:id:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Slug video sudah digunakan.'
      });
    }

    return res.status(getErrorStatus(error, 400)).json({
      success: false,
      message: error.message || 'Gagal memperbarui video.'
    });
  }
}

export async function updateVideoStatusController(req, res) {
  try {
    const parsed = videoStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Status video tidak valid.'
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Identitas admin tidak ditemukan.'
      });
    }

    const video = await updateVideoStatus(
      req.params.id,
      parsed.data.status,
      req.user.id
    );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Status video berhasil diperbarui.',
      data: video
    });
  } catch (error) {
    console.error('PATCH /api/admin/videos/:id/status:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal memperbarui status video.'
    });
  }
}

export async function archiveVideoController(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Identitas admin tidak ditemukan.'
      });
    }

    const video = await archiveVideo(
      req.params.id,
      req.user.id
    );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Video berhasil diarsipkan.',
      data: video
    });
  } catch (error) {
    console.error('DELETE /api/admin/videos/:id:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal mengarsipkan video.'
    });
  }
}

export async function listPublishedVideosController(req, res) {
  try {
    const parsed = publicVideoListSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Parameter tidak valid.'
      });
    }

    const data = await listPublishedVideos(parsed.data);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /api/videos:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal memuat video.'
    });
  }
}

export async function getPublishedVideoController(req, res) {
  try {
    const video = await getPublishedVideoBySlug(req.params.slug);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      data: video
    });
  } catch (error) {
    console.error('GET /api/videos/:slug:', error);

    return res.status(getErrorStatus(error)).json({
      success: false,
      message: error.message || 'Gagal memuat video.'
    });
  }
}