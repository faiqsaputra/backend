import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Email admin wajib diberikan.');
  console.error('Contoh: npm run admin:promote -- admin@example.com');
  process.exit(1);
}

if (!email.includes('@')) {
  console.error('Format email tidak valid.');
  process.exit(1);
}

async function main() {
  console.log(`Mencari user: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });

  if (!user) {
    throw new Error(
      `User dengan email "${email}" tidak ditemukan di public.users. Login/register terlebih dahulu.`
    );
  }

  if (user.role === 'ADMIN') {
    console.log('User sudah memiliki role ADMIN.');
    console.log(user);
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      updatedAt: true
    }
  });

  console.log('✅ User berhasil dipromosikan menjadi ADMIN.');
  console.log(updatedUser);
}

main()
  .catch(error => {
    console.error('❌ Gagal mengubah role:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });