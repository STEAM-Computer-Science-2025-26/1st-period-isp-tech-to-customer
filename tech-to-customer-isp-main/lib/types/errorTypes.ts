// /lib/errors.ts
// Error structure types for use across the app

export type ErrorCode =
  // Auth errors
  | 'AUTH_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'USER_EXISTS'
  | 'USER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TOKEN_EXPIRED'

  // Validation errors
  | 'VALIDATION_ERROR'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_ROLE'
  | 'INVALID_JOB_STATUS'
  | 'INVALID_PRIORITY'

  // Resource errors
  | 'NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'COMPANY_NOT_FOUND'
  | 'EMPLOYEE_NOT_FOUND'

  // Business logic errors
  | 'TECH_NOT_AVAILABLE'
  | 'JOB_ALREADY_ASSIGNED'
  | 'INSUFFICIENT_SKILLS'
  | 'INVALID_ASSIGNMENT'
  
  // System errors
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';


export interface ErrorType {
  message: string;
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface ErrorResponse extends ErrorType {
  action: string;
}