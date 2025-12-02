import { Response } from 'express';

/**
 * Standardized API response interface for consistency across all endpoints
 */
export interface ApiResponse<T = unknown> {
  status: 'success' | 'error' | 'fail';
  message?: string;
  data?: T;
  errors?: Record<string, unknown> | string[] | Array<Record<string, unknown>>;
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Response utility class for standardized API responses
 * Following REST API best practices and ensuring consistent response format
 */
export class ResponseUtil {
  /**
   * Send success response with data
   * @param res Express response object
   * @param data Response data
   * @param message Success message
   * @param statusCode HTTP status code (default: 200)
   */
  static success<T>(
    res: Response,
    data: T,
    message = 'Operation successful',
    statusCode = 200
  ): void {
    const response: ApiResponse<T> = {
      status: 'success',
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send success response without data
   * @param res Express response object
   * @param message Success message
   * @param statusCode HTTP status code (default: 200)
   */
  static successMessage(
    res: Response,
    message: string,
    statusCode = 200
  ): void {
    const response: ApiResponse = {
      status: 'success',
      message,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send error response for server errors
   * @param res Express response object
   * @param message Error message
   * @param statusCode HTTP status code (default: 500)
   * @param errors Error details
   */
  static error(
    res: Response,
    message = 'Internal server error',
    statusCode = 500,
    errors?: Record<string, unknown> | string[] | Array<Record<string, unknown>>
  ): void {
    const response: ApiResponse = {
      status: 'error',
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send fail response for client errors (validation, authentication, etc.)
   * @param res Express response object
   * @param message Failure message
   * @param errors Validation or other errors
   * @param statusCode HTTP status code (default: 400)
   */
  static fail(
    res: Response,
    message: string,
    errors?: Record<string, unknown> | string[] | Array<Record<string, unknown>>,
    statusCode = 400
  ): void {
    const response: ApiResponse = {
      status: 'fail',
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send paginated success response
   * @param res Express response object
   * @param data Response data
   * @param pagination Pagination metadata
   * @param message Success message
   */
  static successWithPagination<T>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    },
    message = 'Data retrieved successfully'
  ): void {
    const response: ApiResponse<T[]> = {
      status: 'success',
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        pagination,
      },
    };

    res.status(200).json(response);
  }

  /**
   * Send created resource response
   * @param res Express response object
   * @param data Created resource data
   * @param message Success message
   */
  static created<T>(
    res: Response,
    data: T,
    message = 'Resource created successfully'
  ): void {
    this.success(res, data, message, 201);
  }

  /**
   * Send no content response
   * @param res Express response object
   */
  static noContent(res: Response): void {
    res.status(204).send();
  }

  /**
   * Send unauthorized response
   * @param res Express response object
   * @param message Error message
   */
  static unauthorized(
    res: Response,
    message = 'Unauthorized access'
  ): void {
    this.fail(res, message, undefined, 401);
  }

  /**
   * Send forbidden response
   * @param res Express response object
   * @param message Error message
   */
  static forbidden(
    res: Response,
    message = 'Access forbidden'
  ): void {
    this.fail(res, message, undefined, 403);
  }

  /**
   * Send not found response
   * @param res Express response object
   * @param message Error message
   */
  static notFound(
    res: Response,
    message = 'Resource not found'
  ): void {
    this.fail(res, message, undefined, 404);
  }

  /**
   * Send validation error response
   * @param res Express response object
   * @param errors Validation errors
   * @param message Error message
   */
  static validationError(
    res: Response,
    errors: Record<string, unknown> | string[] | Array<Record<string, unknown>>,
    message = 'Validation failed'
  ): void {
    this.fail(res, message, errors, 422);
  }
}

/**
 * Helper function to create paginated response metadata
 * @param page Current page
 * @param limit Items per page
 * @param total Total items
 */
export const createPaginationMeta = (
  page: number,
  limit: number,
  total: number
) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
