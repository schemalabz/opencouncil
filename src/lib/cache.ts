/**
 * Caching System
 * 
 * This file re-exports the key utilities from the cache system to make imports cleaner.
 */

// Core caching utilities
export { createCache } from './cache/index';

// Cached query functions
export * from './cache/queries';
