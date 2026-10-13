import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const frontendUrl = process.env.FRONTEND_URL || 'https://frontend-nisabot.vercel.app';

const profileSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  role: true,
  createdAt: true,
  updatedAt: true
};

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama minimal 2 karakter.')
    .max(100, 'Nama terlalu panjang.'),

  email: z
    .string()
    .trim()
    .email('Format email tidak valid.')
    .max(254)
    .transform(value => value.toLowerCase()),

  password: z
    .string()
    .min(8, 'Password minimal 8 karakter.')
    .max(128, 'Password terlalu panjang.')
});

function getUserName(user) {
  const metadata = user.user_metadata ?? {};

  return (
    metadata.name ||
    metadata.full_name ||
    user.email?.split('@')[0] ||
    'Pengguna Nusa'
  );
}

function getAvatarUrl(user) {
  const metadata = user.user_metadata ?? {};

  return metadata.avatar_url || metadata.picture || null;
}

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message:
          parsed.error.issues[0]?.message ||
          'Data registrasi tidak valid.'
      });
    }

    const { name, email, password } = parsed.data;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name
        },
        emailRedirectTo: `${frontendUrl}/login`
      }
    });

    if (error) {
      console.error('Supabase register error:', {
        status: error.status,
        message: error.message
      });

      if (error.status === 429) {
        return res.status(429).json({
          success: false,
          message:
            'Terlalu banyak percobaan registrasi. Silakan coba lagi nanti.'
        });
      }

      return res.status(400).json({
        success: false,
        message:
          'Registrasi gagal. Periksa email dan password yang digunakan.'
      });
    }

    if (!data.user) {
      return res.status(400).json({
        success: false,
        message: 'Akun gagal dibuat.'
      });
    }

    let profile = await prisma.user.findUnique({
      where: {
        id: data.user.id
      },
      select: profileSelect
    });

    if (!profile) {
      profile = await prisma.user.create({
        data: {
          id: data.user.id,
          name,
          email: data.user.email || email,
          avatarUrl: getAvatarUrl(data.user),
          role: 'USER'
        },
        select: profileSelect
      });
    }

    return res.status(201).json({
      success: true,
      message: data.session
        ? 'Akun berhasil dibuat.'
        : 'Akun berhasil dibuat. Silakan verifikasi email untuk melanjutkan.',
      user: profile,
      session: data.session ?? null
    });
  } catch (error) {
    console.error('POST /api/auth/register:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Akun dengan data tersebut sudah terdaftar.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat membuat akun.'
    });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(req.auth.token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'User tidak ditemukan.'
      });
    }

    if (user.id !== req.auth.userId) {
      return res.status(401).json({
        success: false,
        message: 'Identitas user tidak valid.'
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'Akun tidak memiliki email yang valid.'
      });
    }

    let profile = await prisma.user.findUnique({
      where: {
        id: user.id
      },
      select: profileSelect
    });

    if (!profile) {
      profile = await prisma.user.create({
        data: {
          id: user.id,
          name: getUserName(user),
          email: user.email,
          avatarUrl: getAvatarUrl(user),
          role: 'USER'
        },
        select: profileSelect
      });
    } else {
      const nextName = getUserName(user);
      const nextAvatarUrl = getAvatarUrl(user);

      const shouldUpdate =
        profile.email !== user.email ||
        profile.name !== nextName ||
        profile.avatarUrl !== nextAvatarUrl;

      if (shouldUpdate) {
        profile = await prisma.user.update({
          where: {
            id: user.id
          },
          data: {
            name: nextName,
            email: user.email,
            avatarUrl: nextAvatarUrl
          },
          select: profileSelect
        });
      }
    }

    return res.status(200).json({
      success: true,
      user: profile
    });
  } catch (error) {
    console.error('GET /api/auth/me:', error);

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'Profil pengguna memiliki konflik data.'
      });
    }

    if (error?.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Profil pengguna tidak ditemukan.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal memuat profil pengguna.'
    });
  }
});

export default router;