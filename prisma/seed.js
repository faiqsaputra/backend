import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('🌱 Starting Nusa Bot database seed...');

  const materials = [
    {
      title: 'Pengantar Fikih Haid',
      slug: 'pengantar-fikih-haid',
      description: 'Materi pengantar untuk memahami pembahasan haid dalam fikih.',
      content: 'Materi pengantar fikih haid untuk pembelajaran Nusa Bot.',
      coverImage: '/assets/img/materi/haid.png',
      order: 1,
      status: 'PUBLISHED',
      quizRequired: true,
      publishedAt: new Date()
    },
    {
      title: 'Haid, Nifas, dan Istihadhah',
      slug: 'haid-nifas-istihadhah',
      description: 'Mengenal istilah dan perbedaan pembahasan darah dalam fikih.',
      content: 'Materi pembelajaran mengenai haid, nifas, dan istihadhah.',
      coverImage: '/assets/img/materi/nifas.png',
      order: 2,
      status: 'PUBLISHED',
      quizRequired: true,
      publishedAt: new Date()
    },
    {
      title: 'Masa Suci dan Siklus',
      slug: 'masa-suci-dan-siklus',
      description: 'Materi dasar mengenai masa suci dan pencatatan siklus.',
      content: 'Materi pembelajaran mengenai masa suci dan pencatatan siklus.',
      coverImage: '/assets/img/materi/siklus.png',
      order: 3,
      status: 'DRAFT',
      quizRequired: true
    }
  ];

  for (const materialData of materials) {
    const material = await prisma.material.upsert({
      where: { slug: materialData.slug },
      update: materialData,
      create: materialData
    });

    console.log(`✓ Material: ${material.title}`);
  }

  const pengantarHaid = await prisma.material.findUnique({
    where: { slug: 'pengantar-fikih-haid' }
  });

  const haidNifas = await prisma.material.findUnique({
    where: { slug: 'haid-nifas-istihadhah' }
  });

  if (!pengantarHaid || !haidNifas) {
    throw new Error('Required material for quiz seed was not found');
  }

  const quizzes = [
    {
      materialId: pengantarHaid.id,
      title: 'Kuis Pengantar Fikih Haid',
      description: 'Uji pemahaman dasar setelah mempelajari materi pengantar.',
      passingScore: 80,
      xpPerCorrect: 100,
      order: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      questions: {
        create: [
          {
            type: 'CHOICE',
            title: 'Pemahaman Dasar',
            question: 'Apa tujuan utama mempelajari fikih haid?',
            answer: 'A',
            explanation: 'Materi fikih dipelajari agar pengguna memahami ketentuan yang menjadi rujukan dalam pembahasan ibadah.',
            points: 1,
            order: 1,
            options: {
              create: [
                {
                  label: 'Memahami ketentuan fikih yang berkaitan dengan haid',
                  value: 'A',
                  isCorrect: true,
                  order: 1
                },
                {
                  label: 'Menentukan siklus secara medis',
                  value: 'B',
                  isCorrect: false,
                  order: 2
                },
                {
                  label: 'Menggantikan pemeriksaan kesehatan',
                  value: 'C',
                  isCorrect: false,
                  order: 3
                },
                {
                  label: 'Menentukan diagnosis penyakit',
                  value: 'D',
                  isCorrect: false,
                  order: 4
                }
              ]
            }
          },
          {
            type: 'TRUE_FALSE',
            title: 'Konsep Dasar',
            question: 'Pembahasan fikih haid dapat berdiri sendiri tanpa mempertimbangkan sumber rujukan.',
            answer: false,
            explanation: 'Materi fikih perlu merujuk pada sumber yang menjadi dasar pembahasannya.',
            points: 1,
            order: 2
          }
        ]
      }
    }
  ];

  for (const quizData of quizzes) {
    const quiz = await prisma.quiz.upsert({
      where: { materialId: quizData.materialId },
      update: {
        title: quizData.title,
        description: quizData.description,
        passingScore: quizData.passingScore,
        xpPerCorrect: quizData.xpPerCorrect,
        order: quizData.order,
        status: quizData.status,
        publishedAt: quizData.publishedAt
      },
      create: quizData
    });

    console.log(`✓ Quiz: ${quiz.title}`);
  }

  console.log('✅ Nusa Bot seed completed successfully');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });