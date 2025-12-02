import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorType } from '../utils/errors';
import { ResponseUtil } from '../utils/response';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/**
 * Global error handling middleware
 * Handles all types of errors in a centralized manner
 */
export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error for debugging (in production, use proper logging service)
  console.error('Error occurred:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle different types of errors
  if (error instanceof AppError) {
    handleAppError(error, res);
  } else if (error instanceof ZodError) {
    handleZodError(error, res);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(error, res);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    handlePrismaValidationError(error, res);
  } else if (error.name === 'JsonWebTokenError') {
    handleJWTError(res);
  } else if (error.name === 'TokenExpiredError') {
    handleJWTExpiredError(res);
  } else {
    handleUnknownError(error, res);
  }
};

/**
 * Handle custom application errors
 */
const handleAppError = (error: AppError, res: Response): void => {
  ResponseUtil.fail(
    res,
    error.message,
    error.details,
    error.statusCode
  );
};

/**
 * Handle Zod validation errors
 */
const handleZodError = (error: ZodError, res: Response): void => {
  const errors = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  ResponseUtil.validationError(
    res,
    errors,
    'Validation failed'
  );
};

/**
 * Handle Prisma known request errors
 */
const handlePrismaError = (
  error: Prisma.PrismaClientKnownRequestError,
  res: Response
): void => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint failed
      const field = error.meta?.target as string[] | undefined;
      const fieldName = field?.[0] || 'field';
      ResponseUtil.fail(
        res,
        `A record with this ${fieldName} already exists`,
        { field: fieldName, code: error.code },
        409
      );
      break;
    
    case 'P2025':
      // Record not found
      ResponseUtil.notFound(
        res,
        'The requested record was not found'
      );
      break;
    
    case 'P2003':
      // Foreign key constraint failed
      ResponseUtil.fail(
        res,
        'Invalid reference to related record',
        { code: error.code },
        400
      );
      break;
    
    case 'P2014':
      // Required relation missing
      ResponseUtil.fail(
        res,
        'Required relation is missing',
        { code: error.code },
        400
      );
      break;
    
    default:
      ResponseUtil.error(
        res,
        'Database operation failed',
        500,
        { code: error.code, details: (error as any).message }
      );
  }
};

/**
 * Handle Prisma validation errors
 */
const handlePrismaValidationError = (
  error: Prisma.PrismaClientValidationError,
  res: Response
): void => {
  ResponseUtil.validationError(
    res,
    { prismaError: error.message },
    'Database validation failed'
  );
};

/**
 * Handle JWT errors
 */
const handleJWTError = (res: Response): void => {
  ResponseUtil.unauthorized(
    res,
    'Invalid token. Please log in again.'
  );
};

/**
 * Handle JWT expired errors
 */
const handleJWTExpiredError = (res: Response): void => {
  ResponseUtil.unauthorized(
    res,
    'Your token has expired. Please log in again.'
  );
};

/**
 * Handle unknown errors
 */
const handleUnknownError = (error: Error, res: Response): void => {
  // In production, don't expose internal error details
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  ResponseUtil.error(
    res,
    'Something went wrong',
    500,
    isDevelopment ? { 
      name: error.name,
      message: error.message,
      stack: error.stack 
    } : undefined
  );
};

/**
 * Async error handler wrapper
 * Catches async errors and passes them to the global error handler
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    ErrorType.NOT_FOUND_ERROR,
    404
  );
  next(error);
};
