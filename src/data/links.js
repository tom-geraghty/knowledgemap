// Link definitions — the connections between nodes.
//
// Each link connects two nodes by their id, with a strength value:
//   strength: 1 = loosely related
//   strength: 2 = related
//   strength: 3 = closely related / directly referenced
//
// Links are directional in the data but rendered as undirected edges in the graph.
// Add a link in one direction only — duplicates will trigger a validation warning.

export const RAW_LINKS = [

  { source: "overview",        target: "key-concept",     strength: 3 },
  { source: "overview",        target: "history",          strength: 2 },
  { source: "overview",        target: "getting-started",  strength: 2 },
  { source: "key-concept",     target: "case-study",       strength: 2 },
  { source: "getting-started", target: "case-study",       strength: 3 },

];
