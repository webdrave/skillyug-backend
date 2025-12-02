import prisma from '../utils/prisma';
import { SessionQuiz, QuizResponse } from '@prisma/client';

/**
 * Quiz Repository
 * Handles database operations for session quizzes and responses
 */
export class QuizRepository {
  /**
   * Create a quiz
   */
  async create(data: {
    sessionId: string;
    question: string;
    options: string[];
    correctAnswer: number;
    points: number;
    timeLimit?: number;
  }): Promise<SessionQuiz> {
    return prisma.sessionQuiz.create({
      data,
    });
  }

  /**
   * Find quiz by ID
   */
  async findById(id: string): Promise<SessionQuiz | null> {
    return prisma.sessionQuiz.findUnique({
      where: { id },
      include: {
        responses: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find all quizzes for a session
   */
  async findBySession(sessionId: string): Promise<SessionQuiz[]> {
    return prisma.sessionQuiz.findMany({
      where: { sessionId },
      include: {
        _count: {
          select: {
            responses: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Update quiz
   */
  async update(
    id: string,
    data: Partial<Pick<SessionQuiz, 'question' | 'options' | 'correctAnswer' | 'points' | 'duration' | 'launchedAt' | 'endsAt'>>
  ): Promise<SessionQuiz> {
    // Type assertion to handle Prisma's JSON type incompatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return prisma.sessionQuiz.update({
      where: { id },
      data: data as any,
    });
  }

  /**
   * Delete quiz
   */
  async delete(id: string): Promise<SessionQuiz> {
    return prisma.sessionQuiz.delete({
      where: { id },
    });
  }

  /**
   * Create quiz response
   */
  async createResponse(data: {
    quizId: string;
    userId: string;
    answer: number;
    isCorrect: boolean;
    responseTime: number;
    points: number;
  }): Promise<QuizResponse> {
    return prisma.quizResponse.create({
      data,
    });
  }

  /**
   * Find response by quiz and user
   */
  async findResponse(quizId: string, userId: string): Promise<QuizResponse | null> {
    return prisma.quizResponse.findUnique({
      where: {
        quizId_userId: {
          quizId,
          userId,
        },
      },
    });
  }

  /**
   * Get quiz responses with stats
   */
  async getQuizResponses(quizId: string): Promise<{
    responses: QuizResponse[];
    stats: {
      totalResponses: number;
      correctResponses: number;
      averageResponseTime: number;
      averagePoints: number;
    };
  }> {
    const responses = await prisma.quizResponse.findMany({
      where: { quizId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: {
        responseTime: 'asc', // Fastest first
      },
    });

    const stats = await prisma.quizResponse.aggregate({
      where: { quizId },
      _count: true,
      _avg: {
        responseTime: true,
        points: true,
      },
    });

    const correctCount = responses.filter((r) => r.isCorrect).length;

    return {
      responses,
      stats: {
        totalResponses: stats._count,
        correctResponses: correctCount,
        averageResponseTime: stats._avg.responseTime || 0,
        averagePoints: stats._avg.points || 0,
      },
    };
  }

  /**
   * Get session quiz leaderboard
   */
  async getSessionLeaderboard(sessionId: string): Promise<
    Array<{
      userId: string;
      userName: string;
      userImage: string | null;
      totalPoints: number;
      correctAnswers: number;
      totalQuizzes: number;
      averageResponseTime: number;
    }>
  > {
    const leaderboard = await prisma.quizResponse.groupBy({
      by: ['userId'],
      where: {
        quiz: {
          sessionId,
        },
      },
      _sum: {
        points: true,
      },
      _avg: {
        responseTime: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          points: 'desc',
        },
      },
    });

    // Get user details and correct answer counts
    const enrichedLeaderboard = await Promise.all(
      leaderboard.map(async (entry) => {
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: {
            fullName: true,
            email: true,
            image: true,
          },
        });

        const correctAnswers = await prisma.quizResponse.count({
          where: {
            userId: entry.userId,
            quiz: {
              sessionId,
            },
            isCorrect: true,
          },
        });

        return {
          userId: entry.userId,
          userName: user?.fullName || user?.email || 'Unknown',
          userImage: user?.image || null,
          totalPoints: entry._sum.points || 0,
          correctAnswers,
          totalQuizzes: entry._count.id,
          averageResponseTime: entry._avg.responseTime || 0,
        };
      })
    );

    return enrichedLeaderboard;
  }

  /**
   * Get user's quiz performance in session
   */
  async getUserSessionPerformance(sessionId: string, userId: string): Promise<{
    totalQuizzes: number;
    answeredQuizzes: number;
    correctAnswers: number;
    totalPoints: number;
    averageResponseTime: number;
    rank: number;
  }> {
    const totalQuizzes = await prisma.sessionQuiz.count({
      where: { sessionId },
    });

    const userResponses = await prisma.quizResponse.aggregate({
      where: {
        userId,
        quiz: {
          sessionId,
        },
      },
      _count: true,
      _sum: {
        points: true,
      },
      _avg: {
        responseTime: true,
      },
    });

    const correctAnswers = await prisma.quizResponse.count({
      where: {
        userId,
        quiz: {
          sessionId,
        },
        isCorrect: true,
      },
    });

    // Calculate rank
    const leaderboard = await this.getSessionLeaderboard(sessionId);
    const rank = leaderboard.findIndex((entry) => entry.userId === userId) + 1;

    return {
      totalQuizzes,
      answeredQuizzes: userResponses._count,
      correctAnswers,
      totalPoints: userResponses._sum.points || 0,
      averageResponseTime: userResponses._avg.responseTime || 0,
      rank: rank > 0 ? rank : leaderboard.length + 1,
    };
  }
}

export const quizRepository = new QuizRepository();
