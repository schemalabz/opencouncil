/**
 * Generic result type for operations that can succeed or fail
 * Uses discriminated union for type safety
 */
export type Result<T, E = string> =
    | { success: true; data: T; error?: never }
    | { success: false; error: E; data?: never };

/**
 * API result type for operations that can return data with optional errors
 * (useful when you want to return partial results even with errors)
 */
export type ApiResult<T, E = string> = {
    data: T;
    error?: E;
};

/**
 * Helper functions for creating results
 */
export const createSuccess = <T>(data: T): Result<T> => ({
    success: true,
    data
});

export const createError = <E = string>(error: E): Result<never, E> => ({
    success: false,
    error
});