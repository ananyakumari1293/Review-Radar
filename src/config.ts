// Review Radar configuration file

// Gemini API connection details
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com';
export const GEMINI_API_VERSION = 'v1'; // Using 'v1' stable version to resolve models/gemini-1.5-flash 404 beta errors
export const GEMINI_MODEL = 'gemini-2.5-flash'; // Updated from diagnostics: gemini-2.5-flash is fully supported by your key

// Minimum reviews count for warning threshold
export const MIN_REVIEWS_FOR_ACCURACY = 5;

// Maximum reviews to parse to conserve tokens
export const MAX_REVIEWS_TO_ANALYZE = 25;
