import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances of Prisma Client in development
  var prisma: PrismaClient | undefined;
}

const prisma = globalThis.prisma || new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  console.log('🔌 Prisma disconnecting...');
  await prisma.$disconnect();
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;

// Helper functions for common operations
export class PrismaService {
  static async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  static async getUserWithPurchases(userId: string) {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        purchases: {
          include: {
            items: {
              include: {
                course: {
                  include: {
                    mentor: true,
                    lessons: {
                      orderBy: { order: 'asc' }
                    }
                  }
                }
              }
            }
          }
        },
        enrollments: {
          include: {
            course: true,
            lessonProgress: true
          }
        }
      }
    });
  }

  static async getCourseWithDetails(courseId: string) {
    return await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        mentor: true,
        lessons: {
          orderBy: { order: 'asc' }
        },
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        tags: true,
        _count: {
          select: {
            enrollments: true,
            reviews: true,
            purchaseItems: true
          }
        }
      }
    });
  }

  static async getEnrollmentWithProgress(userId: string, courseId: string) {
    return await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      },
      include: {
        course: {
          include: {
            lessons: {
              orderBy: { order: 'asc' }
            }
          }
        },
        lessonProgress: {
          include: {
            lesson: true
          }
        }
      }
    });
  }

  static async getUserAnalytics(userId: string) {
    const enrollments = await prisma.enrollment.count({
      where: { userId }
    });

    const completedCourses = await prisma.enrollment.count({
      where: { 
        userId,
        status: 'COMPLETED'
      }
    });

    const totalLessonsCompleted = await prisma.lessonProgress.count({
      where: {
        enrollment: {
          userId
        },
        completed: true
      }
    });

    const totalTimeSpent = await prisma.lessonProgress.aggregate({
      where: {
        enrollment: {
          userId
        },
        completed: true
      },
      _sum: {
        timeSpentMin: true
      }
    });

    return {
      enrollments,
      completedCourses,
      totalLessonsCompleted,
      totalTimeSpent: totalTimeSpent._sum.timeSpentMin || 0
    };
  }

  static async getCourseAnalytics(courseId: string) {
    const enrollments = await prisma.enrollment.count({
      where: { courseId }
    });

    const completions = await prisma.enrollment.count({
      where: { 
        courseId,
        status: 'COMPLETED'
      }
    });

    const averageRating = await prisma.review.aggregate({
      where: { courseId },
      _avg: {
        rating: true
      }
    });

    const revenue = await prisma.purchaseItem.aggregate({
      where: { courseId },
      _sum: {
        purchasePrice: true
      }
    });

    return {
      enrollments,
      completions,
      completionRate: enrollments > 0 ? (completions / enrollments) * 100 : 0,
      averageRating: averageRating._avg.rating || 0,
      revenue: revenue._sum.purchasePrice || 0
    };
  }

  static async disconnect() {
    await prisma.$disconnect();
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
