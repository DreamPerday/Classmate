export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode: number, readonly operational = true) { super(message); }
}
export class NotFoundError extends AppError { constructor(resource: string, id: string) { super(`${resource} not found: ${id}`, "NOT_FOUND", 404); } }
export class ValidationError extends AppError { constructor(message: string) { super(message, "VALIDATION_ERROR", 422); } }
export class DependencyError extends AppError { constructor(message: string) { super(message, "DEPENDENCY_UNAVAILABLE", 503); } }

