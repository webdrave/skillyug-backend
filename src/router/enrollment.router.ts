import { Router } from 'express';
import { enrollmentController } from '../controllers/enrollment.controller';
import { protect } from '../middleware/auth.middleware';

export const enrollmentRouter = Router();

// Protected routes (require authentication)
enrollmentRouter.use(protect);

// Get user's enrollments
enrollmentRouter.get('/my-enrollments', enrollmentController.getMyEnrollments.bind(enrollmentController));

export default enrollmentRouter;
