import { Request, Response, NextFunction } from 'express';
import { quizService } from '../services/quiz.service';

/**
 * Quiz Controller
 * Handles HTTP requests for quiz management
 */

/**
 * Create a quiz for a session
 */
export async function createQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId, question, options, correctAnswer, points, duration } = req.body;

    const quiz = await quizService.createQuiz(sessionId, mentorId, {
      question,
      options,
      correctAnswer,
      points,
      timeLimit: duration,
    });

    res.status(201).json({
      success: true,
      data: quiz,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Launch a quiz during live session
 */
export async function launchQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quizId } = req.params;

    const quiz = await quizService.launchQuiz(quizId, mentorId);

    res.json({
      success: true,
      data: quiz,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * End a quiz
 */
export async function endQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quizId } = req.params;

    const result = await quizService.endQuiz(quizId, mentorId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session quizzes
 */
export async function getSessionQuizzes(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const quizzes = await quizService.getSessionQuizzes(sessionId);

    res.json({
      success: true,
      data: quizzes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get quiz results
 */
export async function getQuizResults(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;

    const results = await quizService.getQuizResults(quizId);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session leaderboard
 */
export async function getSessionLeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const leaderboard = await quizService.getSessionLeaderboard(sessionId);

    res.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's quiz performance
 */
export async function getUserPerformance(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.params;

    const performance = await quizService.getUserPerformance(sessionId, userId);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a quiz
 */
export async function deleteQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const mentorId = req.user?.id;
    if (!mentorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quizId } = req.params;

    await quizService.deleteQuiz(quizId, mentorId);

    res.json({
      success: true,
      message: 'Quiz deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
