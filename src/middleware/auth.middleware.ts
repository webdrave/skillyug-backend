import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserType } from '@prisma/client';
import { userRepository } from '../repositories/user.repository';
import { AuthenticationError, AuthorizationError } from '../utils/errors';


interface JwtPayload extends jwt.JwtPayload {
  id: string;
  email: string;
  userType: UserType;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

type AsyncRequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRequestHandler) => 
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => 
    Promise.resolve(fn(req, res, next)).catch(next);

// Authentication middleware - validates JWT and attaches user to request
export const protect = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Not logged in');
  }

  const token = authHeader.split(' ')[1];
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof decoded === 'string') throw new AuthenticationError('Invalid token');
    
    const payload = decoded as JwtPayload;
    if (!payload.id || !payload.email || !payload.userType) {
      throw new AuthenticationError('Invalid token');
    }

    // Only check if user exists and is verified (reduced query)
    const user = await userRepository.findById(payload.id);
    if (!user || !user.isVerified) {
      throw new AuthenticationError(user ? 'Account not verified' : 'User not found');
    }
    
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw error;
  }
});

// Role-based access control
export const restrictTo = (...allowedUserTypes: UserType[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AuthenticationError('Not logged in');
    if (!allowedUserTypes.includes(req.user.userType)) {
      throw new AuthorizationError(`Access denied. Required: ${allowedUserTypes.join(' or ')}`);
    }
    next();
  };
};

// Optional authentication - attaches user if token present
export const optionalAuth = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || !process.env.JWT_SECRET) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (typeof decoded !== 'string') {
      const payload = decoded as JwtPayload;
      if (payload.id && payload.email && payload.userType) {
        const user = await userRepository.findById(payload.id);
        if (user?.isVerified) req.user = payload;
      }
    }
  } catch (error) {
    console.log('Optional auth failed:', error);
  }

  next();
});

// Check resource ownership
export const checkResourceOwnership = (userIdField: string = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AuthenticationError('Authentication required');
    
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    if (resourceUserId && resourceUserId !== req.user.id && req.user.userType !== 'ADMIN') {
      throw new AuthorizationError('Access denied');
    }
    
    next();
  };
};
