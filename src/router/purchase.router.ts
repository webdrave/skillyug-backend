import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

export const purchaseRouter = Router();

// Protected routes (require authentication)
purchaseRouter.use(protect);

// User purchase routes
purchaseRouter.post('/', purchaseController.savePurchase.bind(purchaseController));
purchaseRouter.post('/enroll-free', purchaseController.enrollInFreeCourse.bind(purchaseController));
purchaseRouter.get('/my-purchases', purchaseController.getUserPurchases.bind(purchaseController));
purchaseRouter.get('/my-courses', purchaseController.getUserPurchasedCourses.bind(purchaseController));
purchaseRouter.get('/stats', purchaseController.getUserPurchaseStats.bind(purchaseController));
purchaseRouter.get('/check/:courseId', purchaseController.checkPurchaseStatus.bind(purchaseController));
purchaseRouter.get('/verify-access/:courseId', purchaseController.verifyCourseAccess.bind(purchaseController));
purchaseRouter.get('/:purchaseId', purchaseController.getPurchaseById.bind(purchaseController));

// Bundle purchase routes
purchaseRouter.post('/bundle', purchaseController.createBundlePurchase.bind(purchaseController));

// Admin only routes
purchaseRouter.get(
  '/analytics',
  restrictTo('ADMIN'),
  purchaseController.getPurchaseAnalytics.bind(purchaseController)
);

purchaseRouter.post(
  '/:purchaseId/cancel',
  restrictTo('ADMIN'),
  purchaseController.cancelPurchase.bind(purchaseController)
);

export default purchaseRouter;
