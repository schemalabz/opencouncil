// Sentinel tags used to mark highlighted (matched) spans in Elasticsearch
// highlight fragments. Deliberately not HTML (e.g. <em>) so the client can split
// on them unambiguously and never has to parse markup or use
// dangerouslySetInnerHTML. Kept in a dependency-free module so the UI/tests can
// import them without pulling in the Elasticsearch query builder (and env).
//
// IMPORTANT: alphanumeric only — no markdown-special chars (_ * ` # [ ]) — so that
// stripMarkdown() on descriptions does not mangle the markers. The random-looking
// suffix makes accidental collisions with real content effectively impossible.
export const HIGHLIGHT_START = 'oc7H1ghL1ghtStart9q';
export const HIGHLIGHT_END = 'oc7H1ghL1ghtEnd9q';
