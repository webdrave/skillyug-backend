/**
 * Custom error types for the application
 * Following best practices for error handling and classification
 */

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  DUPLICATE_ERROR = 'DUPLICATE_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: HttpStatusCode;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly details?: Record<string, unknown> | Array<Record<string, unknown>>;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL_SERVER_ERROR,
    statusCode: HttpStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
    isOperational = true,
    details?: Record<string, unknown> | Array<Record<string, unknown>>
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown> | Array<Record<string, unknown>>) {
    super(
      message,
      ErrorType.VALIDATION_ERROR,
      HttpStatusCode.UNPROCESSABLE_ENTITY,
      true,
      details
    );
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(
      message,
      ErrorType.AUTHENTICATION_ERROR,
      HttpStatusCode.UNAUTHORIZED
    );
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden') {
    super(
      message,
      ErrorType.AUTHORIZATION_ERROR,
      HttpStatusCode.FORBIDDEN
    );
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(
      `${resource} not found`,
      ErrorType.NOT_FOUND_ERROR,
      HttpStatusCode.NOT_FOUND
    );
  }
}

/**
 * Duplicate resource error class
 */
export class DuplicateError extends AppError {
  constructor(resource = 'Resource', field?: string) {
    const message = field 
      ? `${resource} with this ${field} already exists`
      : `${resource} already exists`;
    
    super(
      message,
      ErrorType.DUPLICATE_ERROR,
      HttpStatusCode.CONFLICT
    );
  }
}

/**
 * Business logic error class
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, details?: Record<string, unknown> | Array<Record<string, unknown>>) {
    super(
      message,
      ErrorType.BUSINESS_LOGIC_ERROR,
      HttpStatusCode.BAD_REQUEST,
      true,
      details
    );
  }
}

/**
 * External service error class
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is unavailable`,
      ErrorType.EXTERNAL_SERVICE_ERROR,
      HttpStatusCode.BAD_GATEWAY
    );
  }
}

/**
 * Database error class
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details?: Record<string, unknown> | Array<Record<string, unknown>> | unknown) {
    // If details is unknown, safely convert it to a Record if possible
    const safeDetails = details && typeof details === 'object' && details !== null 
      ? details as Record<string, unknown> | Array<Record<string, unknown>>
      : details ? { error: String(details) } : undefined;
      
    super(
      message,
      ErrorType.DATABASE_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      true,
      safeDetails
    );
  }
}

/**
 * Forbidden error class
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(
      message,
      ErrorType.AUTHORIZATION_ERROR,
      HttpStatusCode.FORBIDDEN
    );
  }
}

/**
 * Bad request error class
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown> | Array<Record<string, unknown>>) {
    super(
      message,
      ErrorType.VALIDATION_ERROR,
      HttpStatusCode.BAD_REQUEST,
      true,
      details
    );
  }
}
