import {
  materialCreateSchema,
  materialListSchema,
  materialStatusSchema,
  materialUpdateSchema,
  publicMaterialListSchema
} from '../schemas/material.schema.js';

import {
  archiveMaterial,
  createMaterial,
  getAdminMaterialById,
  getMaterialStats,
  getPublishedMaterialBySlug,
  listAdminMaterials,
  listPublishedMaterials,
  updateMaterial,
  updateMaterialStatus
} from '../services/material.service.js';

export async function listAdminMaterialsController(req, res) {
  try {
    const parsed = materialListSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Parameter tidak valid.'
      });
    }

    const data = await listAdminMaterials(parsed.data);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /api/admin/materials:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat materi.'
    });
  }
}

export async function statsMaterialsController(_req, res) {
  try {
    const data = await getMaterialStats();

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /api/admin/materials/stats:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat statistik materi.'
    });
  }
}

export async function getAdminMaterialController(req, res) {
  try {
    const material = await getAdminMaterialById(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Materi tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    console.error('GET /api/admin/materials/:id:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat materi.'
    });
  }
}

export async function createMaterialController(req, res) {
  try {
    const parsed = materialCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
        code: issue.code
      }));

      console.warn('POST /api/admin/materials validation failed:', errors);

      return res.status(400).json({
        success: false,
        message: errors[0]?.message || 'Data materi tidak valid.',
        errors
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Identitas pengguna tidak ditemukan.'
      });
    }

    const material = await createMaterial(parsed.data, req.user.id);

    return res.status(201).json({
      success: true,
      message: 'Materi berhasil dibuat.',
      data: material
    });
  } catch (error) {
    console.error('POST /api/admin/materials:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Slug materi sudah digunakan.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal membuat materi.'
    });
  }
}

export async function updateMaterialController(req, res) {
  try {
    const parsed = materialUpdateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Data materi tidak valid.'
      });
    }

    const material = await updateMaterial(
      req.params.id,
      parsed.data,
      req.user.id
    );

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Materi tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Materi berhasil diperbarui.',
      data: material
    });
  } catch (error) {
    console.error('PATCH /api/admin/materials/:id:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Slug materi sudah digunakan.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui materi.'
    });
  }
}

export async function updateMaterialStatusController(req, res) {
  try {
    const parsed = materialStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Status materi tidak valid.'
      });
    }

    const material = await updateMaterialStatus(
      req.params.id,
      parsed.data.status,
      req.user.id
    );

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Materi tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Status materi berhasil diperbarui.',
      data: material
    });
  } catch (error) {
    console.error('PATCH /api/admin/materials/:id/status:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui status materi.'
    });
  }
}

export async function archiveMaterialController(req, res) {
  try {
    const material = await archiveMaterial(
      req.params.id,
      req.user.id
    );

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Materi tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Materi berhasil diarsipkan.',
      data: material
    });
  } catch (error) {
    console.error('DELETE /api/admin/materials/:id:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengarsipkan materi.'
    });
  }
}

export async function listPublishedMaterialsController(req, res) {
  try {
    const parsed = publicMaterialListSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Parameter tidak valid.'
      });
    }

    const data = await listPublishedMaterials(parsed.data);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('GET /api/materials:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat materi.'
    });
  }
}

export async function getPublishedMaterialController(req, res) {
  try {
    const slug = req.params.slug?.trim();

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Slug materi tidak valid.'
      });
    }

    const material = await getPublishedMaterialBySlug(slug);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Materi tidak ditemukan.'
      });
    }

    return res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    console.error('GET /api/materials/:slug:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat materi.'
    });
  }
}