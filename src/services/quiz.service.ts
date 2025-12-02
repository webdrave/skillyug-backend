import { quizRepository } from '../repositories/quiz.repository';
import { sessionRepository } from '../repositories/session.repository';
import { getSocketServer } from '../socket/streaming.socket';
import { SessionStatus } from '@prisma/client';
import { mentorRepository } from '../repositories/mentor.repository';

/**
 * Quiz Service
 * Business logic for session quizzes
 */
export class QuizService {
  /**
   * Create a quiz for a session
   */
  async createQuiz(
    sessionId: string,
    mentorId: string,
    quizData: {
      question: string;
      options: string[];
      correctAnswer: number;
      points?: number;
      timeLimit?: number;
    }
  ) {
    // Verify session exists and mentor is authorized
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const mentorProfile = (session as unknown as { mentorProfile: { userId: string } }).mentorProfile;
    if (!mentorProfile || mentorProfile.userId !== mentorId) {
      throw new Error('Unauthorized: Not your session');
    }

    // Validate quiz data
    if (!quizData.question || quizData.question.trim().length === 0) {
      throw new Error('Question is required');
    }

    if (!Array.isArray(quizData.options) || quizData.options.length < 2) {
      throw new Error('At least 2 options are required');
    }

    if (
      quizData.correctAnswer < 0 ||
      quizData.correctAnswer >= quizData.options.length
    ) {
      throw new Error('Invalid correct answer index');
    }

    // Create quiz
    const quiz = await quizRepository.create({
      sessionId,
      question: quizData.question,
      options: quizData.options,
      correctAnswer: quizData.correctAnswer,
      points: quizData.points || 10,
      timeLimit: quizData.timeLimit,
    });

    return quiz;
  }

  /**
   * Launch a quiz during live session
   */
  async launchQuiz(quizId: string, mentorId: string) {
    const quiz = await quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    // Verify session and mentor ownership
    const session = await sessionRepository.findById(quiz.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Get mentor profile to verify ownership
    const mentorProfile = await mentorRepository.getMentorProfileByUserId(mentorId);
    if (!mentorProfile || session.mentorProfileId !== mentorProfile.id) {
      throw new Error('Unauthorized');
    }

    if (session.status !== SessionStatus.LIVE) {
      throw new Error('Session is not live');
    }

    if (quiz.launchedAt) {
      throw new Error('Quiz already launched');
    }

    // Update quiz as launched
    const launchedQuiz = await quizRepository.update(quizId, {
      launchedAt: new Date(),
    });

    // Broadcast quiz to session participants via Socket.IO
    try {
      const socketServer = getSocketServer();
      socketServer.launchQuiz(session.id, {
        id: launchedQuiz.id,
        question: launchedQuiz.question,
        options: launchedQuiz.options,
        points: launchedQuiz.points,
        duration: launchedQuiz.duration,
        launchedAt: launchedQuiz.launchedAt,
      });
    } catch (error) {
      console.error('Failed to broadcast quiz launch:', error);
    }

    return launchedQuiz;
  }

  /**
   * End a quiz
   */
  async endQuiz(quizId: string, mentorId: string) {
    const quiz = await quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const session = await sessionRepository.findById(quiz.sessionId);
    const mentorProfile3 = (session as unknown as { mentorProfile: { userId: string } }).mentorProfile;
    if (!session || !mentorProfile3 || mentorProfile3.userId !== mentorId) {
      throw new Error('Unauthorized');
    }

    if (!quiz.launchedAt) {
      throw new Error('Quiz not launched yet');
    }

    if (quiz.endsAt) {
      throw new Error('Quiz already ended');
    }

    // Update quiz as ended
    const endedQuiz = await quizRepository.update(quizId, {
      endsAt: new Date(),
    });

    // Broadcast quiz end
    try {
      const socketServer = getSocketServer();
      socketServer.endQuiz(session.id, quizId);
    } catch (error) {
      console.error('Failed to broadcast quiz end:', error);
    }

    // Get quiz results
    const results = await quizRepository.getQuizResponses(quizId);

    return {
      quiz: endedQuiz,
      results,
    };
  }

  /**
   * Get session quizzes
   */
  async getSessionQuizzes(sessionId: string) {
    return quizRepository.findBySession(sessionId);
  }

  /**
   * Get quiz with responses
   */
  async getQuizResults(quizId: string) {
    const quiz = await quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const results = await quizRepository.getQuizResponses(quizId);

    return {
      quiz,
      ...results,
    };
  }

  /**
   * Get session leaderboard
   */
  async getSessionLeaderboard(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return quizRepository.getSessionLeaderboard(sessionId);
  }

  /**
   * Get user's quiz performance
   */
  async getUserPerformance(sessionId: string, userId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return quizRepository.getUserSessionPerformance(sessionId, userId);
  }

  /**
   * Delete quiz
   */
  async deleteQuiz(quizId: string, mentorId: string) {
    const quiz = await quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const session = await sessionRepository.findById(quiz.sessionId);
    const mentorProfile4 = (session as unknown as { mentorProfile: { userId: string } }).mentorProfile;
    if (!session || !mentorProfile4 || mentorProfile4.userId !== mentorId) {
      throw new Error('Unauthorized');
    }

    if (quiz.launchedAt && !quiz.endsAt) {
      throw new Error('Cannot delete active quiz');
    }

    return quizRepository.delete(quizId);
  }
}

export const quizService = new QuizService();
