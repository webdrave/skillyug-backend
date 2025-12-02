import { Router } from 'express';
import {
  createQuiz,
  launchQuiz,
  endQuiz,
  getSessionQuizzes,
  getQuizResults,
  getSessionLeaderboard,
  getUserPerformance,
  deleteQuiz,
} from '../controllers/quiz.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { UserType } from '@prisma/client';

const router = Router();

// Protected routes
router.use(protect);

// Public (authenticated) routes
router.get('/sessions/:sessionId/quizzes', getSessionQuizzes);
router.get('/:quizId/results', getQuizResults);
router.get('/sessions/:sessionId/leaderboard', getSessionLeaderboard);
router.get('/sessions/:sessionId/my-performance', getUserPerformance);

// Mentor-only routes
router.post('/', restrictTo(UserType.MENTOR), createQuiz);
router.post('/:quizId/launch', restrictTo(UserType.MENTOR), launchQuiz);
router.post('/:quizId/end', restrictTo(UserType.MENTOR), endQuiz);
router.delete('/:quizId', restrictTo(UserType.MENTOR), deleteQuiz);

export default router;
