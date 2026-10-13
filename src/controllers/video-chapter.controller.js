import {
  createVideoChapterSchema,
  updateVideoChapterSchema
} from '../schemas/video-chapter.schema.js';

import {
  createVideoChapter,
  deleteVideoChapter,
  listVideoChapters,
  updateVideoChapter
} from '../services/video-chapter.service.js';

export async function listChapters(req, res) {
  try {
    const chapters = await listVideoChapters(req.params.videoId);

    return res.status(200).json({
      success: true,
      chapters
    });
  } catch (error) {
    console.error('GET chapters:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Gagal mengambil chapter.'
    });
  }
}

export async function createChapter(req, res) {
  try {
    const parsed = createVideoChapterSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Data chapter tidak valid.'
      });
    }

    const chapter = await createVideoChapter(
      req.params.videoId,
      parsed.data
    );

    return res.status(201).json({
      success: true,
      message: 'Chapter berhasil dibuat.',
      chapter
    });
  } catch (error) {
    console.error('POST chapter:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Gagal membuat chapter.'
    });
  }
}

export async function updateChapter(req, res) {
  try {
    const parsed = updateVideoChapterSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Data chapter tidak valid.'
      });
    }

    const chapter = await updateVideoChapter(
      req.params.chapterId,
      parsed.data
    );

    return res.status(200).json({
      success: true,
      message: 'Chapter berhasil diperbarui.',
      chapter
    });
  } catch (error) {
    console.error('PUT chapter:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Gagal memperbarui chapter.'
    });
  }
}

export async function removeChapter(req, res) {
  try {
    await deleteVideoChapter(req.params.chapterId);

    return res.status(200).json({
      success: true,
      message: 'Chapter berhasil dihapus.'
    });
  } catch (error) {
    console.error('DELETE chapter:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Gagal menghapus chapter.'
    });
  }
}