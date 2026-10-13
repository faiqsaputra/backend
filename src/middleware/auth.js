  import { prisma } from '../lib/prisma.js';
  import { supabase } from '../lib/supabase.js';

  function getBearerToken(req) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) return null;

    const token = authorization.slice(7).trim();

    return token || null;
  }

  export async function requireAuth(req, res, next) {
    try {
      const token = getBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { data, error } = await supabase.auth.getClaims(token);

      if (error || !data?.claims?.sub) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      const userId = data.claims.sub;
      const email = data.claims.email ?? null;

      req.auth = {
        userId,
        email,
        token,
        claims: data.claims
      };

      // Membuat req.user tersedia untuk controller.
      // Tetap menggunakan ID pengguna dari token Supabase yang terverifikasi.
      req.user = {
        id: userId,
        email
      };

      return next();
    } catch (error) {
      console.error('requireAuth:', error);

      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  }

  export function requireRole(...allowedRoles) {
    return async (req, res, next) => {
      try {
        const userId = req.auth?.userId;

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true
          }
        });

        if (!user) {
          return res.status(403).json({
            success: false,
            message: 'User profile not found'
          });
        }

        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden'
          });
        }

        // Mengganti req.user dengan profil lengkap dari database.
        req.user = user;

        return next();
      } catch (error) {
        console.error('requireRole:', error);

        return res.status(500).json({
          success: false,
          message: 'Authorization failed'
        });
      }
    };
  }