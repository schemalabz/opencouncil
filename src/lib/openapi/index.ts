// Import route registrations — each file calls registry.registerPath() on import.
// Add new route files here as they are migrated.
import './routes/cities';
import './routes/meetings';
import './routes/search';
import './routes/parties';
import './routes/people';

export { registry, generateSpec } from './registry';
