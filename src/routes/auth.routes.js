import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);

function normalizeFrontendUrl(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();

    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost');

    if (isProduction && isLocalhost) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

const frontendUrl =
  normalizeFrontendUrl(process.env.FRONTEND_URL) ||
  (isProduction ? null : 'http://localhost:5173');

if (isProduction && !frontendUrl) {
  console.warn(
    '[AUTH] FRONTEND_URL belum dikonfigurasi dengan domain production yang valid. ' +
    'Redirect email akan mengikuti Site URL yang dikonfigurasi di Supabase.'
  );
}

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
    .max(254, 'Email terlalu panjang.')
    .transform((value) => value.toLowerCase()),

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
    metadata.fullName ||
    user.email?.split('@')[0] ||
    'Pengguna Nusa'
  );
}

function getAvatarUrl(user) {
  const metadata = user.user_metadata ?? {};

  return metadata.avatar_url || metadata.picture || null;
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

function handleDatabaseError(res, error, fallbackMessage) {
  if (error?.code === 'P2002') {
    return sendError(
      res,
      409,
      'Data pengguna sudah terdaftar atau bertentangan dengan data lain.'
    );
  }

  if (error?.code === 'P2025') {
    return sendError(
      res,
      404,
      'Data pengguna tidak ditemukan.'
    );
  }

  console.error('Authentication database error:', {
    code: error?.code,
    message: error?.message
  });

  return sendError(res, 500, fallbackMessage);
}

/**
 * POST /api/auth/register
 *
 * Membuat akun melalui Supabase Auth dan memastikan
 * profil pengguna tersedia di database aplikasi.
 */
router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(
        res,
        400,
        parsed.error.issues[0]?.message ||
          'Data registrasi tidak valid.'
      );
    }

    const { name, email, password } = parsed.data;

    const signUpOptions = {
      data: {
        name,
        full_name: name
      }
    };

    if (frontendUrl) {
      signUpOptions.emailRedirectTo = `${frontendUrl}/login`;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: signUpOptions
    });

    if (error) {
      console.error('Supabase registration error:', {
        status: error.status,
        code: error.code,
        message: error.message
      });

      if (error.status === 429) {
        return sendError(
          res,
          429,
          'Terlalu banyak percobaan registrasi. Silakan coba lagi nanti.'
        );
      }

      if (error.status === 422) {
        return sendError(
          res,
          409,
          'Akun dengan email tersebut mungkin sudah terdaftar.'
        );
      }

      return sendError(
        res,
        400,
        'Registrasi gagal. Periksa email dan password yang digunakan.'
      );
    }

    if (!data.user) {
      return sendError(
        res,
        400,
        'Akun gagal dibuat.'
      );
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
    console.error('POST /api/auth/register:', {
      code: error?.code,
      message: error?.message
    });

    if (error?.code === 'P2002') {
      return sendError(
        res,
        409,
        'Akun dengan data tersebut sudah terdaftar.'
      );
    }

    return sendError(
      res,
      500,
      'Terjadi kesalahan pada server saat membuat akun.'
    );
  }
});

/**
 * GET /api/auth/me
 *
 * Memvalidasi access token Supabase dan mengambil profil
 * pengguna dari database aplikasi.
 *
 * Profil baru dibuat secara otomatis jika pengguna valid
 * dari Supabase belum mempunyai profil lokal.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const accessToken = req.auth?.token;

    if (!userId || !accessToken) {
      return sendError(
        res,
        401,
        'Sesi autentikasi tidak valid. Silakan login kembali.'
      );
    }

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return sendError(
        res,
        401,
        'Sesi pengguna tidak valid atau sudah kedaluwarsa.'
      );
    }

    if (user.id !== userId) {
      return sendError(
        res,
        401,
        'Identitas pengguna tidak valid.'
      );
    }

    if (!user.email) {
      return sendError(
        res,
        400,
        'Akun tidak memiliki email yang valid.'
      );
    }

    const name = getUserName(user);
    const avatarUrl = getAvatarUrl(user);

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
          name,
          email: user.email,
          avatarUrl,
          role: 'USER'
        },
        select: profileSelect
      });
    } else {
      const shouldUpdate =
        profile.email !== user.email ||
        profile.name !== name ||
        profile.avatarUrl !== avatarUrl;

      if (shouldUpdate) {
        profile = await prisma.user.update({
          where: {
            id: user.id
          },
          data: {
            name,
            email: user.email,
            avatarUrl
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
    console.error('GET /api/auth/me:', {
      code: error?.code,
      message: error?.message
    });

    if (error?.code === 'P2002') {
      return sendError(
        res,
        409,
        'Profil pengguna memiliki konflik data.'
      );
    }

    if (error?.code === 'P2025') {
      return sendError(
        res,
        404,
        'Profil pengguna tidak ditemukan.'
      );
    }

    return sendError(
      res,
      500,
      'Gagal memuat profil pengguna.'
    );
  }
});

export default router;