// Node definitions for the knowledge graph.
//
// Each node represents an article, page, or concept in your knowledge base.
//
// Fields:
//   id        — unique slug, used in URLs (?node=your-id) and link references
//   label     — display name shown in the graph and panels
//   author    — author name (used for the author filter)
//   themes    — array of theme ids from themes.js (first theme sets the node colour)
//   weight    — visual size of the node (1–10). Use higher values for hub/central nodes.
//   desc      — 35–50 word description shown in the detail panel when a node is clicked.
//               Write what the piece *argues*, not just what it's about.
//   url       — full URL of the article or page (use "#" if no URL yet)
//   slug      — the URL slug of the article (used for featured image fetching and ?slug= links)
//   date      — publication date in YYYY-MM-DD format (used for "recently added" badge)

export const RAW_NODES = [

  // Hub node
  { id: "overview",        label: "Overview",        author: "Your Name", themes: ["foundations"],            weight: 9, desc: "The central node of this knowledge graph. Replace with a description of your most important foundational piece — the article that connects most of the other ideas in your knowledge base.", url: "https://example.com/overview",        slug: "overview",        date: "2024-01-01" },

  // Foundations
  { id: "key-concept",     label: "Key Concept",     author: "Your Name", themes: ["foundations"],            weight: 7, desc: "Replace with a description of a foundational concept in your field. What does it argue? What is its core claim? Who defined it? Write in third person, 35-50 words, no hedging.", url: "https://example.com/key-concept",     slug: "key-concept",     date: "2024-01-01" },
  { id: "history",         label: "A Brief History", author: "Your Name", themes: ["foundations"],            weight: 5, desc: "Replace with a description of an article covering the history or origin of your field. Where did these ideas come from? What shaped them? Third person, 35-50 words.", url: "https://example.com/history",         slug: "history",         date: "2024-01-01" },

  // Practice
  { id: "getting-started", label: "Getting Started", author: "Your Name", themes: ["practice"],               weight: 6, desc: "Replace with a description of a practical introductory piece. What does someone need to do first? What tools or approaches does it introduce? Third person, 35-50 words, no marketing tone.", url: "https://example.com/getting-started", slug: "getting-started", date: "2024-01-01" },
  { id: "case-study",      label: "Case Study",      author: "Your Name", themes: ["practice","foundations"],  weight: 5, desc: "Replace with a description of a real-world case study. What happened? What does it illustrate? What can practitioners learn? Third person, 35-50 words, specific not generic.", url: "https://example.com/case-study",      slug: "case-study",      date: "2024-01-01" },

];
