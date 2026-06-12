export interface ValidationExceptionResponse {
    message?: string | string[];
    errors?: string | string[];
    detail?: string;
    error?: string;
    statusCode?: number;
}
