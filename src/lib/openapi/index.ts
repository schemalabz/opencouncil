// Import route registrations — each file calls registry.registerPath() on import.
// Add new route files here as they are migrated.
import './routes/cities';
import './routes/search';
import './routes/meetings';
import './routes/statistics';

export { registry, generateSpec } from './registry';
