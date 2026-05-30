import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { THEMES } from "../data/themes";
import { RAW_NODES } from "../data/nodes";
import { RAW_LINKS } from "../data/links";
import pkgJson from "../../package.json";

// Feature flags
const ENABLE_PAPERS_MODE = true; // set to true to show the Articles/Papers toggle

const seenIds = new Set();
const ARTICLE_NODES = RAW_NODES.filter(n => {
  if (seenIds.has(n.id)) return false;
  seenIds.add(n.id);
  return true;
});

function getNodeColor(node, themes) {
  // Paper nodes use topic[], article nodes use themes[]
  const key = node.topic ? node.topic[0] : node.themes?.[0];
  return key ? (themes[key]?.color || "#888") : "#888";
}

function getNodeDomain(node) {
  if (!node.url || node.url === "#") return "psychsafety";
  if (node.url.includes("iterum.co.uk")) return "iterum";
  if (node.url.includes("tomgeraghty.co.uk")) return "tomgeraghty";
  return "psychsafety";
}

const DOMAIN_STYLE = {
  iterum:       { dash: "5,3",  strokeWidth: 2 },
  tomgeraghty:  { dash: "2,3",  strokeWidth: 2 },
  psychsafety:  { dash: null,   strokeWidth: 1.5 },
};

function renderMultiThemeNode(selection, getR, themes) {
  selection.each(function (d) {
    const g = d3.select(this);
    const r = getR(d);
    const nodeThemes = (d.topic || d.themes || []).filter(t => themes[t]);
    if (nodeThemes.length <= 1) {
      const ds = DOMAIN_STYLE[getNodeDomain(d)];
      const circ = g.append("circle")
        .attr("r", r).attr("fill", themes[nodeThemes[0]]?.color || "#888")
        .attr("fill-opacity", 0.2).attr("stroke", themes[nodeThemes[0]]?.color || "#888")
        .attr("stroke-width", ds.strokeWidth).attr("class", "node-circle");
      if (ds.dash) circ.attr("stroke-dasharray", ds.dash);
    } else {
      const pie = d3.pie().value(1).sort(null);
      const arc = d3.arc().innerRadius(0).outerRadius(r);
      pie(nodeThemes).forEach((slice, i) => {
        const color = themes[nodeThemes[i]]?.color || "#888";
        g.append("path").attr("d", arc(slice)).attr("fill", color)
          .attr("fill-opacity", 0.25).attr("stroke", color)
          .attr("stroke-width", 0.5).attr("class", "node-circle");
      });
      const ds2 = DOMAIN_STYLE[getNodeDomain(d)];
      const ring = g.append("circle").attr("r", r).attr("fill", "none")
        .attr("stroke", themes[nodeThemes[0]]?.color || "#888")
        .attr("stroke-width", ds2.strokeWidth).attr("class", "node-circle");
      if (ds2.dash) ring.attr("stroke-dasharray", ds2.dash);
    }
  });
}

function buildNeighbours(nodes, links) {
  const map = {};
  nodes.forEach(n => { map[n.id] = new Set(); });
  links.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (map[s]) map[s].add(t);
    if (map[t]) map[t].add(s);
  });
  return map;
}

function buildDegrees(nodes, links) {
  const deg = {};
  nodes.forEach(n => { deg[n.id] = 0; });
  links.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (deg[s] !== undefined) deg[s]++;
    if (deg[t] !== undefined) deg[t]++;
  });
  return deg;
}

const ARTICLE_NEIGHBOURS = buildNeighbours(ARTICLE_NODES, RAW_LINKS);
const ARTICLE_DEGREES    = buildDegrees(ARTICLE_NODES, RAW_LINKS);
const TOP_N = 10;
const ARTICLE_HUB_IDS = new Set(Object.entries(ARTICLE_DEGREES).sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id));

// Node radius — larger on mobile for touch targets
function nodeR(d, isMobile) {
  return isMobile ? 12 + d.weight * 2 : 7 + d.weight * 1.5;
}

function DetailPanel({ node, onClose, onSelectNode, copied, setCopied, getConnected, isMobile, THEMES_MAP, HUB_IDS, DEGREES, ARTICLE_NODES, getNodeColor, DM, onNoteSaved, onAddBiblio, inBiblio }) {
  const connected = getConnected(node);
  const [featuredImage, setFeaturedImage] = useState(null);
  const [showAllConnected, setShowAllConnected] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setFeaturedImage(null); setShowAllConnected(false);
    setDescExpanded(false); setNoteEditing(false); setNoteSaved(false);
    try {
      const notes = JSON.parse(localStorage.getItem("km-notes") || "{}");
      setNoteText(notes[node.id]?.note || "");
    } catch(e) { setNoteText(""); }
  }, [node.id]);

  const saveNote = () => {
    try {
      const notes = JSON.parse(localStorage.getItem("km-notes") || "{}");
      if (noteText.trim()) {
        notes[node.id] = { note: noteText.trim(), savedAt: new Date().toISOString().slice(0, 10) };
      } else { delete notes[node.id]; }
      localStorage.setItem("km-notes", JSON.stringify(notes));
      setNoteEditing(false); setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
      if (onNoteSaved) onNoteSaved();
    } catch(e) {}
  };

  useEffect(() => {
    if (!node.slug) return;
    fetch(`https://psychsafety.com/wp-json/wp/v2/posts?slug=${node.slug}&_embed=true`)
      .then(r => r.json())
      .then(data => {
        const img = data?.[0]?._embedded?.['wp:featuredmedia']?.[0]?.source_url;
        if (img) setFeaturedImage(img);
      })
      .catch(() => {});
  }, [node.slug]);

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: DM.surface, borderTop: `1px solid ${DM.border}`,
      padding: isMobile ? "16px" : "12px 16px",
      zIndex: 30, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
      maxHeight: isMobile ? "60vh" : "auto",
      overflowY: isMobile ? "auto" : "visible",
    }} data-detail-panel>
      {isMobile && (
        <div style={{ width: "40px", height: "4px", background: "#ddd", borderRadius: "2px", margin: "0 auto 12px" }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, maxWidth: "800px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: node.title ? "2px" : "6px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: getNodeColor(node, THEMES_MAP), display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: isMobile ? "16px" : "15px", color: DM.text }}>{node.label}</span>
            {HUB_IDS.has(node.id) && (
              <span style={{ fontSize: "10px", color: "#bbb" }}>· {DEGREES[node.id]} connections</span>
            )}
          </div>
          {node.title && (
            <div style={{ fontSize: "12px", color: DM.textMuted, fontStyle: "italic", marginBottom: "8px", paddingLeft: "18px" }}>
              {node.title}
            </div>
          )}
          <div style={{ display: "flex", gap: isMobile ? "0" : "16px", flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
            {featuredImage && node.url && node.url !== "#" && (
              <a href={node.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block", marginBottom: isMobile ? "10px" : "0" }}>
                <img src={featuredImage} alt={node.label}
                  style={{ width: isMobile ? "100%" : "140px", height: isMobile ? "140px" : "90px",
                    objectFit: "cover", borderRadius: "6px", display: "block",
                    border: `1px solid ${DM.border}`, transition: "opacity 0.15s",
                  }}
                  onMouseOver={e => e.target.style.opacity = "0.85"}
                  onMouseOut={e => e.target.style.opacity = "1"}
                />
              </a>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: DM.textMuted }}>{node.author}</span>
                <span style={{ color: "#ddd", margin: "0 2px" }}>·</span>

                {(node.topic || node.themes || []).filter(t => THEMES_MAP[t]).map(t => (
                  <span key={t} style={{
                    fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                    background: THEMES_MAP[t].color + "22", border: `0.5px solid ${THEMES_MAP[t].color}`,
                    color: THEMES_MAP[t].color, fontWeight: 500
                  }}>{THEMES_MAP[t].label}</span>
                ))}
              </div>
              {(() => {
                const LIMIT = isMobile ? 300 : 500;
                const needsTruncation = node.desc && node.desc.length > LIMIT;
                const displayDesc = needsTruncation && !descExpanded
                  ? node.desc.slice(0, LIMIT).replace(/\s+\S*$/, "") + "…"
                  : node.desc;
                return (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: isMobile ? "14px" : "13px", color: DM.text, lineHeight: 1.6 }}>
                      {displayDesc}
                    </div>
                    {needsTruncation && (
                      <button onClick={() => setDescExpanded(e => !e)}
                        style={{
                          background: "none", border: "none", padding: "2px 0",
                          fontSize: "12px", color: DM.link, cursor: "pointer",
                          fontFamily: "inherit", marginTop: "2px",
                        }}>
                        {descExpanded ? "Show less ↑" : "Show more ↓"}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
                {node.url && node.url !== "#" && (
                  <a href={node.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: "13px", color: "#378ADD", textDecoration: "none", fontWeight: 500 }}>
                    Read article →
                  </a>
                )}

                {node.journal && (
                  <span style={{ fontSize: "11px", color: DM.textMuted, fontStyle: "italic" }}>
                    {node.journal}
                  </span>
                )}
                <span style={{ fontSize: "11px", color: "#bbb" }}>
                  {connected.length} connection{connected.length !== 1 ? "s" : ""}
                </span>
              </div>
              {node.citation && (
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: "10px", color: "#bbb", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Harvard citation</div>
                  <div style={{ fontSize: "11px", color: "#666", lineHeight: 1.5, marginBottom: "6px" }}>
                    {node.citation.split("*").map((part, i) =>
                      i % 2 === 1 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>
                    )}
                  </div>
                  <button onClick={() => {
                    navigator.clipboard.writeText(node.citation.replace(/\*/g, ""));
                    setCopied(true); setTimeout(() => setCopied(false), 2000);
                  }} style={{
                    fontSize: "10px", padding: "2px 8px", borderRadius: "10px", cursor: "pointer",
                    background: copied ? "#f0f9f0" : "transparent",
                    border: `0.5px solid ${copied ? "#2a7a2a" : DM.border}`,
                    color: copied ? "#2a7a2a" : "#888",
                  }}>
                    {copied ? "✓ Copied" : "Copy citation"}
                  </button>
                </div>
              )}
              {node.relatedArticles?.length > 0 && (
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: "10px", color: "#bbb", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Related psychsafety.com articles</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {node.relatedArticles.map(aid => {
                      const article = ARTICLE_NODES.find(n => n.id === aid);
                      if (!article) return null;
                      return (
                        <a key={aid} href={article.url} target="_blank" rel="noreferrer" style={{
                          fontSize: "11px", color: "#378ADD", textDecoration: "none",
                          padding: "2px 7px", borderRadius: "10px",
                          background: "#378ADD11", border: "0.5px solid #378ADD44",
                        }}>
                          {article.label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
          {connected.length > 0 && (
            <div style={{ marginTop: "4px" }}>
              <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                Related articles
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(showAllConnected ? connected : connected.slice(0, isMobile ? 3 : 5)).map(rel => (
                  <button key={rel.id}
                    onClick={() => onSelectNode(rel)}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "4px 8px", borderRadius: "6px", cursor: "pointer",
                      border: `1px solid ${getNodeColor(rel, THEMES_MAP)}44`,
                      background: getNodeColor(rel, THEMES_MAP) + "11",
                      fontSize: "11px", color: DM.text, fontWeight: 400,
                      textAlign: "left", maxWidth: isMobile ? "140px" : "180px",
                    }}
                    title={rel.desc}
                  >
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: getNodeColor(rel, THEMES_MAP), opacity: 0.8 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rel.label}
                    </span>
                    {rel.strength === 3 && <span style={{ fontSize: "9px", color: "#aaa", flexShrink: 0 }}>●●●</span>}
                    {rel.strength === 2 && <span style={{ fontSize: "9px", color: "#ccc", flexShrink: 0 }}>●●</span>}
                  </button>
                ))}
                {connected.length > (isMobile ? 3 : 5) && !showAllConnected && (
                  <button onClick={() => setShowAllConnected(true)} style={{
                    fontSize: "11px", color: DM.textMuted, alignSelf: "center", cursor: "pointer",
                    background: "transparent", border: "none", padding: "2px 4px", fontFamily: "inherit",
                    textDecoration: "underline", textDecorationStyle: "dotted",
                  }}>
                    +{connected.length - (isMobile ? 3 : 5)} more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0, marginLeft: "12px" }}>
          <button
            onClick={() => {
              const cleanUrl = `${window.location.origin}${window.location.pathname}?node=${node.id}`;
              navigator.clipboard.writeText(cleanUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            title="Copy link to this article"
            style={{ fontSize: "11px", padding: isMobile ? "8px 12px" : "4px 10px",
              cursor: "pointer", borderRadius: "8px", border: `1px solid ${DM.border}`,
              background: copied ? "#f0f9f0" : "transparent",
              color: copied ? "#2a7a2a" : "#888",
              minHeight: isMobile ? "44px" : "auto", whiteSpace: "nowrap",
            }}>
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <button onClick={onClose} style={{
            fontSize: "20px", lineHeight: 1, padding: isMobile ? "8px 12px" : "4px 8px",
            cursor: "pointer", borderRadius: "8px",
            border: `1px solid ${DM.border}`, background: "transparent", color: DM.textMuted,
            minWidth: isMobile ? "44px" : "auto", minHeight: isMobile ? "44px" : "auto",
          }}>×</button>
        </div>
      </div>
    </div>
  );
}

export default function Network() {
  // Read ?node= or ?slug= from URL on load — must be defined before first use
  // Read mode from URL first — needed to pick the right dataset for other initialisers
  const getInitialModeFromUrl = () => {
    const m = new URLSearchParams(window.location.search).get("mode");
    return "articles";
  };
  const initialMode = getInitialModeFromUrl();
  // ── Lazy-loaded papers data ─────────────────────────────────────────────




  const PAPER_NODES      = [];
  const PAPER_LINKS      = [];

  const initialNodes = ARTICLE_NODES;
  const initialThemesMap = THEMES;

  // Determine if URL is requesting a paper node (by id or slug)
  // We check ARTICLE_NODES first; if not found there, it must be a paper node (loaded async)
  const getInitialNodeFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get("node");
    const slug = params.get("slug");
    // Search article nodes first
    if (nodeId) {
      const articleMatch = ARTICLE_NODES.find(n => n.id === nodeId);
      if (articleMatch) return articleMatch;
      // Try paper nodes if already loaded
      return null;
    }
    if (slug) {
      const articleMatch = ARTICLE_NODES.find(n => n.slug === slug);
      if (articleMatch) return articleMatch;
      return null;
    }
    return null;
  };
  const initialNode = getInitialNodeFromUrl();



  const getInitialThemeFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("theme");
    return t && initialThemesMap[t] ? t : "all";
  };
  const initialTheme = getInitialThemeFromUrl();

  const getInitialAuthorFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get("author");
    return a ? decodeURIComponent(a) : "All authors";
  };
  const initialAuthor = getInitialAuthorFromUrl();

  const svgRef = useRef(null);
  const tappedRef = useRef(null);
  const lockedRef = useRef(initialNode?.id || null); // locked = selected via click/URL
  const zoomRef = useRef(null);      // d3 zoom behaviour
  const gRef = useRef(null);         // d3 group element
  const simNodesRef = useRef([]);    // live simulation nodes (mutated in place by D3)
  const [activeTheme, setActiveTheme] = useState(initialTheme);
  const [activeAuthor, setActiveAuthor] = useState(initialAuthor);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("km-dark-mode");
    if (stored !== null) return stored === "true";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const [aboutTooltip, setAboutTooltip] = useState(false);
  const [showMyNotes, setShowMyNotes] = useState(false);
  const [showBibliography, setShowBibliography] = useState(false);
  const [allNotes, setAllNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("km-notes") || "{}"); }
    catch(e) { return {}; }
  });
  const [allBiblio, setAllBiblio] = useState(() => {
    try { return JSON.parse(localStorage.getItem("km-biblio") || "[]"); }
    catch(e) { return []; }
  });
  const refreshNotes = useCallback(() => {
    try {
      const notes = JSON.parse(localStorage.getItem("km-notes") || "{}");
      setAllNotes(notes);
      if (!svgRef.current || !simNodesRef.current) return;
      const g = d3.select(svgRef.current).select("g");
      const noteIds = new Set(Object.keys(notes));
      g.selectAll(".note-dot").remove();
      (simNodesRef.current || []).filter(d => noteIds.has(d.id) && d.x != null).forEach(d => {
        const r = Math.sqrt(d.weight || 5) * 4 + 3;
        g.append("circle").attr("class", "note-dot")
          .attr("cx", d.x + r - 2).attr("cy", d.y - r + 2)
          .attr("r", 4).attr("fill", "#378ADD")
          .attr("stroke", "white").attr("stroke-width", 1.5)
          .attr("pointer-events", "none");
      });
    } catch(e) {}
  }, []);
  const refreshBiblio = useCallback(() => {
    try { setAllBiblio(JSON.parse(localStorage.getItem("km-biblio") || "[]")); }
    catch(e) {}
  }, []);
  const generateArticleCitation = useCallback((node) => {
    const formatName = (fullName) => {
      const parts = fullName.trim().split(" ");
      if (parts.length < 2) return fullName;
      const surname = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map(p => p[0] + ".").join("");
      return `${surname}, ${initials}`;
    };
    const authorStr = node.author?.includes(" & ")
      ? node.author.split(" & ").map(formatName).join(" & ")
      : formatName(node.author || "");
    const year = node.date ? node.date.slice(0, 4) : "n.d.";
    const titleFromSlug = (node.slug || "")
      .replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\bOf\b/g, "of").replace(/\bThe\b/g, "the")
      .replace(/\bA\b/g, "a").replace(/\bAnd\b/g, "and")
      .replace(/\bIn\b/g, "in").replace(/\bTo\b/g, "to")
      .replace(/\bFor\b/g, "for").replace(/^./, c => c.toUpperCase());
    const title = node.title || titleFromSlug || node.label;
    return `${authorStr} (${year}) '${title}'. Available at: ${node.url}`;
  }, []);
  const [overlayTop, setOverlayTop] = useState(120);
  // Recalculate theme overlay top position whenever filters change
  useEffect(() => {
    const measure = () => {
      const filterBar = document.querySelector("[data-filter-bar-showing]");
      const header = document.querySelector("[data-header]");
      const bottom = filterBar
        ? filterBar.getBoundingClientRect().bottom
        : (header?.getBoundingClientRect().bottom || 120);
      setOverlayTop(bottom + 4);
    };
    // Measure after paint so newly rendered elements are in the DOM
    requestAnimationFrame(measure);
  }, [activeTheme, activeAuthor]);

  const pillRowRef = useRef(null);
  const [pillRowAtEnd, setPillRowAtEnd] = useState(false);
  const [graphMode, setGraphMode] = useState(initialMode); // "articles" | "papers"

  // Design tokens — swapped by dark mode
  const DM = {
    bg:          darkMode ? "#16181d" : "#f7f5f2",
    surface:     darkMode ? "#1e2028" : "#ffffff",
    surfaceAlt:  darkMode ? "#262830" : "#f7f5f2",
    border:      darkMode ? "#2e3040" : "#eeeeee",
    text:        darkMode ? "#e8e6e2" : "#222222",
    textMuted:   darkMode ? "#888780" : "#888780",
    textFaint:   darkMode ? "#555860" : "#bbbbbb",
    link:        darkMode ? "#6aadee" : "#378ADD",
    nodeLabel:   darkMode ? "#cccccc" : "#444444",
    linkStroke:  darkMode ? "#3a3d4a" : "#dddddd",
    pillBg:      darkMode ? "#262830" : "#f5f5f5",
    pillBorder:  darkMode ? "#3a3d4a" : "#e0e0e0",
    inputBg:     darkMode ? "#1e2028" : "#ffffff",
    shadow:      darkMode ? "0 2px 12px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.08)",
  };

  // Mode-derived data — switches the active dataset
  const NODES      = ARTICLE_NODES;
  const LINKS      = RAW_LINKS;
  const THEMES_MAP = THEMES;
  const NEIGHBOURS = ARTICLE_NEIGHBOURS;
  const DEGREES    = ARTICLE_DEGREES;
  const HUB_IDS    = ARTICLE_HUB_IDS;
  const AUTHORS    = ["All authors", ...new Set(NODES.map(n => n.author).filter(Boolean).sort())];

  const [selected, setSelected] = useState(initialNode);
  const [tapped, setTapped] = useState(null); // first tap on mobile — highlight only
  const setTappedBoth = (val) => { setTapped(val); tappedRef.current = val; };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [highlightId, setHighlightId] = useState(initialNode?.id || null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, node: null });
  const [viewMode, setViewMode] = useState("graph"); // "graph" | "list"
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState("most");
  const [showThemeOverlay, setShowThemeOverlay] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const themeCounts = useMemo(() => {
    const counts = {};
    NODES.forEach(n => (n.topic || n.themes || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return counts;
  }, [NODES]);

  const authorCounts = useMemo(() => {
    const counts = {};
    NODES.forEach(n => { counts[n.author] = (counts[n.author] || 0) + 1; });
    return counts;
  }, [NODES]);

  const updateUrl = useCallback((nodeId) => {
    const url = new URL(window.location);
    if (nodeId) {
      url.searchParams.set("node", nodeId);
    } else {
      url.searchParams.delete("node");
    }
    window.history.pushState({}, "", url);
  }, []);

  const updateThemeUrl = useCallback((themeId) => {
    const url = new URL(window.location);
    if (themeId && themeId !== "all") {
      url.searchParams.set("theme", themeId);
    } else {
      url.searchParams.delete("theme");
    }
    window.history.pushState({}, "", url);
  }, []);

  const updateAuthorUrl = useCallback((author) => {
    const url = new URL(window.location);
    if (author && author !== "All authors") {
      url.searchParams.set("author", encodeURIComponent(author));
    } else {
      url.searchParams.delete("author");
    }
    window.history.pushState({}, "", url);
  }, []);

  const updateModeUrl = useCallback((mode) => {
    const url = new URL(window.location);
    if (mode && mode !== "articles") {
      url.searchParams.set("mode", mode);
    } else {
      url.searchParams.delete("mode");
    }
    window.history.pushState({}, "", url);
  }, []);

  const zoomToNode = useCallback((node) => {
    if (!svgRef.current || !zoomRef.current || !gRef.current) return;
    if (!node.x || !node.y) return;
    const svg = d3.select(svgRef.current);
    const W = svgRef.current.clientWidth || window.innerWidth;
    const H = svgRef.current.clientHeight || window.innerHeight - 130;
    const scale = 1.8;
    // Offset vertical centre upward by half the detail panel height so the
    // node sits in the middle of the visible area above the panel
    const panelEl = document.querySelector("[data-detail-panel]");
    const panelH = panelEl ? panelEl.getBoundingClientRect().height : 0;
    const tx = W / 2 - scale * node.x;
    const ty = (H - panelH) / 2 - scale * node.y;
    svg.transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }, []);

  const zoomToTheme = useCallback((themeId) => {
    if (!svgRef.current || !zoomRef.current) return;
    const liveNodes = simNodesRef.current
      .filter(d => (d.topic || d.themes || []).includes(themeId) && d.x != null && d.y != null);
    if (!liveNodes.length) return;

    const xs = liveNodes.map(d => d.x);
    const ys = liveNodes.map(d => d.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);

    const W = svgRef.current.clientWidth || window.innerWidth;
    const H = svgRef.current.clientHeight || window.innerHeight - 130;
    const padding = 100;

    const scaleX = (W - padding * 2) / (x1 - x0 || 1);
    const scaleY = (H - padding * 2) / (y1 - y0 || 1);
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 2.5);

    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const tx = W / 2 - scale * cx;
    const ty = H / 2 - scale * cy;

    d3.select(svgRef.current).transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }, []);

  const zoomToFit = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const liveNodes = (simNodesRef.current || []).filter(d => d.x != null && d.y != null);
    if (!liveNodes.length) return;
    const xs = liveNodes.map(d => d.x);
    const ys = liveNodes.map(d => d.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = svgRef.current.clientWidth || window.innerWidth;
    const H = svgRef.current.clientHeight || window.innerHeight - 130;
    const padding = 80;
    const scaleX = (W - padding * 2) / (x1 - x0 || 1);
    const scaleY = (H - padding * 2) / (y1 - y0 || 1);
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const tx = W / 2 - scale * cx;
    const ty = H / 2 - scale * cy;
    d3.select(svgRef.current).transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }, []);

  const zoomBy = useCallback((factor) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(
      zoomRef.current.scaleBy, factor
    );
  }, []);

  const handleTheme = useCallback((t) => {
    if (t === "all") {
      setActiveTheme("all"); updateThemeUrl("all");
      setShowThemeOverlay(false);
      setTimeout(() => zoomToFit(), 50);
    } else {
      setActiveTheme(t); updateThemeUrl(t);
      setShowThemeOverlay(true);
      setTimeout(() => zoomToTheme(t), 50);
    }
    setSelected(null); setTappedBoth(null); setHighlightId(null);
  }, [updateThemeUrl, zoomToTheme, zoomToFit]);
  const handleAuthor = useCallback((a) => { setActiveAuthor(a); updateAuthorUrl(a); setSelected(null); setTappedBoth(null); setHighlightId(null); }, [updateAuthorUrl]);


  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setHighlightId(null); return; }
    const lower = q.toLowerCase();
    setSearchResults(NODES.filter(n =>
      n.label.toLowerCase().includes(lower) ||
      (n.title || "").toLowerCase().includes(lower) ||
      n.desc.toLowerCase().includes(lower) ||
      n.author.toLowerCase().includes(lower) ||
      (n.journal || "").toLowerCase().includes(lower)
    ).slice(0, 8));
  }, [NODES]);

  const handleSelectSearch = useCallback((node) => {
    setSelected(node); setHighlightId(node.id);
    lockedRef.current = node.id;
    updateUrl(node.id);
    // Find the live simulation node (has x/y coords)
    const liveNode = simNodesRef.current?.find(d => d.id === node.id);
    if (liveNode) zoomToNode(liveNode);
    setSearchQuery(""); setSearchResults([]);
    if (viewMode === "list") return;
  }, [viewMode, updateUrl]);

  const isNodeVisible = useCallback((node) => {
    const themeOk = activeTheme === "all" || (node.topic || node.themes || []).includes(activeTheme);
    const authorOk = activeAuthor === "All authors" || node.author === activeAuthor;
    return themeOk && authorOk;
  }, [activeTheme, activeAuthor]);

  const getNodeOpacity = useCallback((node) => {
    if (!isNodeVisible(node)) return 0.06;
    if (highlightId) {
      if (node.id === highlightId) return 1;
      if (NEIGHBOURS[highlightId]?.has(node.id)) return 0.9;
      return 0.08;
    }
    return 1;
  }, [isNodeVisible, highlightId, NEIGHBOURS]);

  const getLinkOpacity = useCallback((link) => {
    const s = typeof link.source === "object" ? link.source : NODES.find(n => n.id === link.source);
    const t = typeof link.target === "object" ? link.target : NODES.find(n => n.id === link.target);
    if (!s || !t) return 0.03;
    if (highlightId) {
      if (s.id === highlightId || t.id === highlightId) return 0.7;
      return 0.03;
    }
    if (!isNodeVisible(s) || !isNodeVisible(t)) return 0.03;
    return 0.28;
  }, [isNodeVisible, highlightId, NEIGHBOURS, NODES]);

  useEffect(() => {
    if (viewMode !== "graph") return;
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth || window.innerWidth;
    const H = window.innerHeight - 130;
    const nodes = NODES.map(n => ({ ...n }));
    const links = LINKS.map(l => ({ ...l }));
    const svg = d3.select(el).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();
    const g = svg.append("g");
    gRef.current = g;
    simNodesRef.current = nodes;
    gRef.current = g;
    simNodesRef.current = nodes;

    const zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 4])
      .touchable(true)
      .on("zoom", e => g.attr("transform", e.transform));
    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    // Use lower alpha if nodes have precomputed positions — converges almost instantly
    const hasLayout = nodes.length > 0 && nodes[0].x != null;
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => 100 - (d.strength || 1) * 8).strength(d => (d.strength || 1) * 0.1))
      .force("charge", d3.forceManyBody().strength(d => -120 - d.weight * 10))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide().radius(d => (isMobile ? 28 : 22) + d.weight * 2))
      .alpha(hasLayout ? 0.05 : 1)
      .alphaDecay(hasLayout ? 0.04 : 0.0228);

    const linkSel = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", DM.linkStroke).attr("stroke-width", d => (d.strength || 1) * 0.8)
      .attr("opacity", 0.28).attr("class", "link-line");

    const nodeG = g.append("g").selectAll("g").data(nodes).join("g")
      .style("cursor", "pointer")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // Desktop: hover to highlight, click to select
    // Mobile: first tap to highlight, second tap to select
    nodeG
      .on("mouseenter", (e, d) => {
        if (isMobile) return;
        const rect = el.getBoundingClientRect();
        setTooltip({ visible: true, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, node: d });
        // Only change highlight if no node is locked (selected via click/URL)
        if (!lockedRef.current) setHighlightId(d.id);
      })
      .on("mousemove", e => {
        if (isMobile) return;
        const rect = el.getBoundingClientRect();
        setTooltip(t => ({ ...t, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 }));
      })
      .on("mouseleave", () => {
        if (isMobile) return;
        setTooltip(t => ({ ...t, visible: false }));
        // Restore lock or clear
        if (lockedRef.current) {
          setHighlightId(lockedRef.current);
        } else {
          setHighlightId(null);
        }
      })
      .on("click", (e, d) => {
        e.stopPropagation();
        if (isMobile) {
          // Two-tap: use ref to avoid stale closure
          if (tappedRef.current === d.id) {
            setSelected(d);
            setHighlightId(d.id);
            lockedRef.current = d.id;
            setTappedBoth(null);
            updateUrl(d.id);
          } else {
            setTappedBoth(d.id);
            setHighlightId(d.id);
            setSelected(null);
          }
        } else {
          setSelected(d);
          setHighlightId(d.id);
          lockedRef.current = d.id;
          updateUrl(d.id);
          zoomToNode(d);
        }
      });

    // Invisible larger hit area for mobile
    nodeG.append("circle")
      .attr("r", d => isMobile ? nodeR(d, true) + 8 : nodeR(d, false) + 4)
      .attr("fill", "transparent")
      .attr("stroke", "none");

    renderMultiThemeNode(nodeG, d => nodeR(d, isMobile), THEMES_MAP);

    nodeG.filter(d => HUB_IDS.has(d.id)).append("circle")
      .attr("r", d => nodeR(d, isMobile) + 4).attr("fill", "none")
      .attr("stroke", d => getNodeColor(d, THEMES_MAP)).attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,2").attr("opacity", 0.4).attr("class", "node-circle");

    const labelSel = nodeG.append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", d => isMobile ? Math.max(9, 7 + d.weight * 0.6) : Math.max(8, 6.5 + d.weight * 0.65))
      .attr("fill", DM.nodeLabel).attr("opacity", 0.9)
      .attr("font-weight", d => HUB_IDS.has(d.id) ? 600 : 400)
      .attr("pointer-events", "none").attr("class", "node-label");

    labelSel.each(function (d) {
      const el2 = d3.select(this);
      const words = (d.label || "").split(" ");
      if (words.length <= 2) {
        el2.append("tspan").attr("x", 0).attr("dy", "0.35em").text(d.label);
      } else {
        const mid = Math.ceil(words.length / 2);
        el2.append("tspan").attr("x", 0).attr("dy", "-0.4em").text(words.slice(0, mid).join(" "));
        el2.append("tspan").attr("x", 0).attr("dy", "1.1em").text(words.slice(mid).join(" "));
      }
    });

    let zoomedToInitial = false;
    // Fallback: if simulation hasn't settled after 2.5s, zoom anyway
    let fallbackTimer = null;
    if (initialNode) {
      fallbackTimer = setTimeout(() => {
        if (!zoomedToInitial) {
          const nd = nodes.find(n => n.id === initialNode.id);
          if (nd) { zoomedToInitial = true; zoomToNode(nd); }
        }
      }, hasLayout ? 400 : 2500);
    }
    sim.on("tick", () => {
      linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
      try {
        const noteIds = new Set(Object.keys(JSON.parse(localStorage.getItem("km-notes") || "{}")));
        g.selectAll(".note-dot").remove();
        nodes.filter(d => noteIds.has(d.id) && d.x != null).forEach(d => {
          const r = Math.sqrt(d.weight || 5) * 4 + 3;
          g.append("circle").attr("class", "note-dot")
            .attr("cx", d.x + r - 2).attr("cy", d.y - r + 2)
            .attr("r", 4).attr("fill", "#378ADD")
            .attr("stroke", "white").attr("stroke-width", 1.5)
            .attr("pointer-events", "none");
        });
      } catch(e) {}
      // Zoom to initial node once simulation has cooled enough to give stable coords
      if (!zoomedToInitial && initialNode && sim.alpha() < 0.05) {
        const nd = nodes.find(n => n.id === initialNode.id);
        if (nd && nd.x && nd.y) {
          zoomedToInitial = true;
          clearTimeout(fallbackTimer);
          // Pin the node briefly so it can't drift during the zoom transition
          nd.fx = nd.x; nd.fy = nd.y;
          zoomToNode(nd);
          setTimeout(() => { nd.fx = null; nd.fy = null; }, 800);
        }
      }
    });

    svg.on("click", () => { setSelected(null); setTappedBoth(null); setHighlightId(null); lockedRef.current = null; updateUrl(null); });
    return () => { sim.stop(); svg.selectAll("*").remove(); clearTimeout(fallbackTimer); };
  }, [viewMode, isMobile, graphMode, darkMode]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll(".node-circle").each(function (d) { if (d) d3.select(this).attr("opacity", getNodeOpacity(d)); });
    svg.selectAll(".node-label").each(function (d) { if (d) d3.select(this).attr("opacity", getNodeOpacity(d) > 0.5 ? 0.9 : 0.05); });
    svg.selectAll(".link-line").each(function (d) {
      const op = getLinkOpacity(d);
      const isActive = op > 0.5;
      d3.select(this)
        .attr("opacity", op)
        .attr("stroke-width", isActive ? (d.strength || 1) * 1.4 : (d.strength || 1) * 0.8)
        .attr("stroke", isActive ? (darkMode ? "#aaaaaa" : "#999999") : DM.linkStroke);
    });
  }, [getNodeOpacity, getLinkOpacity]);

  const getConnected = (node) => {
    if (!node) return [];
    return LINKS
      .filter(l => l.source === node.id || l.target === node.id)
      .map(l => {
        const otherId = l.source === node.id ? l.target : l.source;
        const other = NODES.find(n => n.id === otherId);
        return other ? { ...other, strength: l.strength || 1 } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.strength - a.strength);
  };

  // Filtered nodes for list view
  const filteredNodes = useMemo(() => {
    const filtered = NODES.filter(n => {
      const themeOk = activeTheme === "all" || (n.topic || n.themes || []).includes(activeTheme);
      const authorOk = activeAuthor === "All authors" || n.author === activeAuthor;
      const searchOk = !searchQuery.trim() ||
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.author.toLowerCase().includes(searchQuery.toLowerCase());
      return themeOk && authorOk && searchOk;
    });
    switch (sortBy) {
      case "newest":   return [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      case "oldest":   return [...filtered].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      case "most":     return [...filtered].sort((a, b) => (DEGREES[b.id] || 0) - (DEGREES[a.id] || 0));
      case "least":    return [...filtered].sort((a, b) => (DEGREES[a.id] || 0) - (DEGREES[b.id] || 0));
      case "az":
      default:         return [...filtered].sort((a, b) => a.label.localeCompare(b.label));
    }
  }, [NODES, DEGREES, activeTheme, activeAuthor, searchQuery, sortBy]);

  const Pill = ({ color, label, count, active, onClick, small }) => (
    <button onClick={onClick} style={{
      fontSize: small ? "10px" : "11px",
      padding: small ? "2px 7px" : isMobile ? "4px 10px" : "3px 9px",
      borderRadius: "20px", cursor: "pointer", border: `0.5px solid ${color}`,
      background: active ? color : "transparent", color: active ? "#fff" : color,
      fontWeight: active ? 600 : 400, transition: "all 0.15s",
      display: "flex", alignItems: "center", gap: "3px",
      minHeight: isMobile ? "32px" : "auto",
    }}>
      {label}
      {count !== undefined && (
        <span style={{ fontSize: "9px", opacity: active ? 0.8 : 0.6, borderRadius: "8px", padding: "0 3px" }}>
          {count}
        </span>
      )}
    </button>
  );


  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: DM.bg, minHeight: "100vh", color: DM.text }}>

      {/* Header */}
      <div data-header style={{ padding: isMobile ? "10px 12px 8px" : "10px 14px 8px", borderBottom: `1px solid ${DM.border}`, background: DM.surface }}>

        {/* Title + view toggle + search */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px", flexWrap: "wrap" }}>
          {!isMobile && (
            <>
              <a href="https://psychsafety.com" target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0, background: "#1a1a2e", borderRadius: "6px", padding: "4px 8px" }}>
                <img src="https://psychsafety.com/wp-content/uploads/2019/04/psych-safety-logo-white-300x222.png"
                  alt="psychsafety.com" style={{ width: "48px", height: "auto", display: "block" }}
                  onError={e => { e.target.style.display = "none"; }} />
              </a>
              <span style={{ fontSize: "14px", fontWeight: 600, color: DM.text, whiteSpace: "nowrap" }}>
                Psychological Safety Knowledge Network
              </span>
            </>
          )}
          {isMobile && (
            <a href="https://psychsafety.com" target="_blank" rel="noreferrer"
              style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0, background: "#1a1a2e", borderRadius: "6px", padding: "3px 6px" }}>
              <img src="https://psychsafety.com/wp-content/uploads/2019/04/psych-safety-logo-white-300x222.png"
                alt="psychsafety.com" style={{ width: "36px", height: "auto", display: "block" }}
                onError={e => { e.target.style.display = "none"; }} />
            </a>
          )}
          {!isMobile && (
            <span style={{ fontSize: "10px", color: "#ccc", whiteSpace: "nowrap" }}>
              {NODES.length} articles · {LINKS.length} connections · beta
            </span>
          )}

          {/* Articles / Papers mode toggle */}
          {ENABLE_PAPERS_MODE && (
            <div style={{
              display: "flex", borderRadius: "20px", border: `1px solid ${DM.border}`,
              overflow: "hidden", marginLeft: isMobile ? "auto" : "8px",
            }}>
              {[["articles", "Articles"]].map(([mode, label]) => (
                <button key={mode} onClick={() => {
                  setGraphMode(mode);
                  updateModeUrl(mode);
                  setActiveTheme("all"); updateThemeUrl("all");
                  setActiveAuthor("All authors"); updateAuthorUrl("All authors");
                  setSelected(null); setHighlightId(null);
                  setTappedBoth(null); lockedRef.current = null;
                  setSearchQuery(""); setSearchResults([]);
                  setShowThemeOverlay(false); updateUrl(null);
                }} style={{
                  fontSize: "11px", padding: isMobile ? "6px 14px" : "4px 12px",
                  background: graphMode === mode ? "#1a1a2e" : "transparent",
                  color: graphMode === mode ? "#fff" : "#888",
                  border: "none", cursor: "pointer", fontWeight: graphMode === mode ? 600 : 400,
                  minHeight: isMobile ? "36px" : "auto",
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* View mode toggle */}
          <div style={{
            display: "flex", borderRadius: "20px", border: `1px solid ${DM.border}`,
            overflow: "hidden", marginLeft: isMobile ? "auto" : "8px",
          }}>
            {["graph", "list"].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                fontSize: "11px", padding: isMobile ? "6px 14px" : "4px 12px",
                background: viewMode === mode ? "#555" : "transparent",
                color: viewMode === mode ? "#fff" : "#888",
                border: "none", cursor: "pointer", fontWeight: viewMode === mode ? 600 : 400,
                minHeight: isMobile ? "36px" : "auto",
              }}>
                {mode === "graph" ? "⬡ Map" : "≡ List"}
              </button>
            ))}
          </div>

          {/* Reset button — visible when anything is filtered or selected */}
          <button onClick={() => {
              setActiveTheme("all"); updateThemeUrl("all");
              setActiveAuthor("All authors"); updateAuthorUrl("All authors");
              setSelected(null); setHighlightId(null);
              setTappedBoth(null); lockedRef.current = null;
              setSearchQuery(""); setSearchResults([]);
              updateUrl(null); setShowThemeOverlay(false);            }} style={{
              fontSize: "11px", padding: isMobile ? "6px 12px" : "4px 10px",
              background: "transparent", border: `1px solid ${DM.border}`,
              borderRadius: "20px", cursor: "pointer", color: DM.textMuted,
              marginLeft: "6px", minHeight: isMobile ? "36px" : "auto",
            }}>
              ↺ Reset
            </button>

          <button onClick={() => {
            const pool = filteredNodes.length > 0 ? filteredNodes : NODES;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            if (!pick) return;
            setSelected(pick); setHighlightId(pick.id);
            lockedRef.current = pick.id; updateUrl(pick.id);
            setViewMode("graph");
            setTimeout(() => {
              const liveNode = simNodesRef.current?.find(d => d.id === pick.id);
              if (liveNode) zoomToNode(liveNode);
            }, 100);
          }} style={{
            fontSize: "11px", padding: isMobile ? "6px 12px" : "4px 10px",
            background: "transparent", border: `1px solid ${DM.border}`,
            borderRadius: "20px", cursor: "pointer", color: DM.textMuted,
            marginLeft: "6px", whiteSpace: "nowrap",
            minHeight: isMobile ? "36px" : "auto", fontFamily: "inherit",
          }} title="Jump to a random node">
            ✦ Surprise me
          </button>

          <a href="https://tally.so/r/Zjvpby" target="_blank" rel="noreferrer" style={{
            fontSize: "11px", padding: isMobile ? "6px 12px" : "4px 10px",
            border: `1px solid ${DM.border}`, borderRadius: "20px", color: DM.textMuted,
            textDecoration: "none", marginLeft: "6px", whiteSpace: "nowrap",
            minHeight: isMobile ? "36px" : "auto", display: "inline-flex", alignItems: "center",
          }}>
            Feedback
          </a>

          {/* Search */}
          <div style={{ position: "relative", marginLeft: isMobile ? "0" : "auto", width: isMobile ? "100%" : "200px" }}>
            <input type="text" placeholder="Search articles…" value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              style={{
                width: "100%", fontSize: "13px",
                padding: isMobile ? "8px 14px" : "5px 10px",
                border: `1px solid ${DM.border}`, borderRadius: "20px", outline: "none",
                fontFamily: "inherit", minHeight: isMobile ? "40px" : "auto",
              }} />
            {searchQuery && (
              <button onClick={() => handleSearch("")} style={{
                position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "16px",
                padding: "4px",
              }}>×</button>
            )}
            {searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: DM.surface, border: `1px solid ${DM.border}`, borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50,
              }}>
                {searchResults.map(n => (
                  <div key={n.id} onClick={() => handleSelectSearch(n)}
                    style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "0.5px solid #f5f5f5", fontSize: "13px" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"}
                    onMouseLeave={e => e.currentTarget.style.background = DM.surface}>
                    <div style={{ fontWeight: 500, color: "#111", marginBottom: "2px" }}>{n.label}</div>
                    <div style={{ fontSize: "11px", color: DM.textMuted, marginBottom: "3px" }}>{n.author}</div>
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {(n.topic || n.themes || []).filter(t => THEMES_MAP[t]).map(t => (
                        <span key={t} style={{
                          fontSize: "9px", padding: "0 5px", borderRadius: "8px",
                          background: THEMES_MAP[t].color + "22", color: THEMES_MAP[t].color,
                          border: `0.5px solid ${THEMES_MAP[t].color}`
                        }}>{THEMES_MAP[t].label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Theme filters — horizontal scroll on mobile */}
        <div style={{ position: "relative" }}>
          {isMobile && !pillRowAtEnd && (
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: "4px", width: "40px",
              background: `linear-gradient(to right, transparent, ${DM.surface})`,
              pointerEvents: "none", zIndex: 2,
            }} />
          )}
          {/* Fade indicator — only on mobile, hides once scrolled to end */}
          {isMobile && !pillRowAtEnd && (
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: "4px", width: "40px",
              background: `linear-gradient(to right, transparent, ${DM.surface})`,
              pointerEvents: "none", zIndex: 2,
            }} />
          )}
          <div ref={pillRowRef}
            onScroll={e => {
              const el = e.currentTarget;
              setPillRowAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
            }}
            style={{
              display: "flex", gap: "4px", flexWrap: isMobile ? "nowrap" : "wrap",
              overflowX: isMobile ? "auto" : "visible",
              paddingBottom: isMobile ? "4px" : "0",
              marginBottom: "5px",
              WebkitOverflowScrolling: "touch",
            }}>

            <span style={{ fontSize: "10px", color: "#bbb", marginRight: "2px", flexShrink: 0 }}>
              Theme:
            </span>
            <Pill color="#555" label="All" count={NODES.length} active={activeTheme === "all"} onClick={() => handleTheme("all")} />
            {Object.entries(THEMES_MAP).map(([key, val]) => (
              <Pill key={key} color={val.color} label={val.label} count={themeCounts[key] || 0}
                active={activeTheme === key} onClick={() => handleTheme(key)} />
            ))}
          </div>

        </div>

        {/* Author filters */}
        {isMobile ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#bbb", flexShrink: 0 }}>Author:</span>
            <select value={activeAuthor} onChange={e => handleAuthor(e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", border: `1px solid ${DM.border}`,
                borderRadius: "8px", background: DM.inputBg, color: DM.text,
                fontFamily: "inherit", flex: 1, minHeight: "36px",
              }}>
              {AUTHORS.map(a => (
                <option key={a} value={a}>
                  {a}{a !== "All authors" ? ` (${authorCounts[a] || 0})` : ` (${NODES.length})`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "#bbb", marginRight: "2px" }}>Author:</span>
            {AUTHORS.map(a => (
              <Pill key={a} small color="#888" label={a}
                count={a === "All authors" ? NODES.length : (authorCounts[a] || 0)}
                active={activeAuthor === a} onClick={() => handleAuthor(a)} />
            ))}
          </div>
        )}

      </div>

      {/* Active filter indicator — shows when theme AND author both active */}
      {activeTheme !== "all" && activeAuthor !== "All authors" && (
        <div data-filter-bar-showing style={{ padding: "4px 14px", background: DM.surfaceAlt, borderBottom: `0.5px solid ${DM.border}`, display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: DM.textMuted }}>
          <span>Showing:</span>
          <span style={{ padding: "1px 7px", borderRadius: "10px", background: THEMES_MAP[activeTheme]?.color + "22", border: `0.5px solid ${THEMES_MAP[activeTheme]?.color}`, color: THEMES_MAP[activeTheme]?.color, fontSize: "10px" }}>
            {THEMES_MAP[activeTheme]?.label}
          </span>
          <span style={{ color: DM.textFaint }}>+</span>
          <span style={{ padding: "1px 7px", borderRadius: "10px", background: DM.pillBg, border: `0.5px solid ${DM.pillBorder}`, color: DM.textMuted, fontSize: "10px" }}>
            {activeAuthor}
          </span>
          <span style={{ color: DM.textFaint }}>—</span>
          <span style={{ color: filteredNodes.length === 0 ? "#e05a5a" : DM.textMuted, fontWeight: filteredNodes.length === 0 ? 600 : 400 }}>
            {filteredNodes.length} result{filteredNodes.length !== 1 ? "s" : ""}
          </span>
          <button onClick={() => { setActiveTheme("all"); updateThemeUrl("all"); setActiveAuthor("All authors"); updateAuthorUrl("All authors"); setShowThemeOverlay(false); }}
            style={{ fontSize: "10px", color: DM.textFaint, background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
            Clear ×
          </button>
        </div>
      )}

      {/* Theme overlay — rendered outside header so it sits below all header rows */}
      {showThemeOverlay && activeTheme !== "all" && THEMES_MAP[activeTheme] && (() => {
        const t = THEMES_MAP[activeTheme];
        return (
          <div style={{
            position: "fixed",
            top: `${overlayTop}px`,
            left: isMobile ? "12px" : "14px", zIndex: 50,
            background: DM.surface, border: `1px solid ${t.color}44`,
            borderLeft: `3px solid ${t.color}`,
            borderRadius: "8px", padding: "12px 14px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
            maxWidth: isMobile ? "calc(100vw - 32px)" : "380px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: t.color }}>{t.label}</span>
              <button onClick={() => setShowThemeOverlay(false)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#bbb", fontSize: "16px", lineHeight: 1, padding: "0 0 0 8px", flexShrink: 0,
              }}>×</button>
            </div>
            <p style={{ fontSize: "12px", color: DM.textMuted, lineHeight: 1.6, margin: "0 0 8px 0" }}>
              {t.desc}
            </p>
            <span style={{ fontSize: "11px", color: "#aaa" }}>
              {themeCounts[activeTheme] || 0} articles
            </span>
          </div>
        );
      })()}

      {/* Graph view */}
      {viewMode === "graph" && (
        <div style={{ position: "relative" }}>
          <div style={{ paddingBottom: "28px" }}><svg ref={svgRef} style={{ width: "100%", display: "block", background: DM.bg }} /></div>

          {/* Mobile first-tap hint */}
          {isMobile && tapped && !selected && (
            <div style={{
              position: "fixed", bottom: "44px", left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.7)", color: "white", borderRadius: "20px",
              padding: "8px 16px", fontSize: "12px", zIndex: 25, pointerEvents: "none",
            }}>
              Tap again to open article
            </div>
          )}

          {/* Desktop tooltip */}
          {!isMobile && tooltip.visible && tooltip.node && (
            <div style={{
              position: "absolute", left: tooltip.x, top: tooltip.y,
              background: DM.surface, border: `1px solid ${DM.border}`, borderRadius: "8px",
              padding: "8px 12px", fontSize: "12px", maxWidth: "220px",
              pointerEvents: "none", zIndex: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
            }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px", color: DM.text }}>{tooltip.node.label}</div>
              <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>
                {tooltip.node.author}
                {HUB_IDS.has(tooltip.node.id) && <span style={{ color: "#bbb", marginLeft: "6px" }}>· {DEGREES[tooltip.node.id]} connections</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {(tooltip.node.topic || tooltip.node.themes || []).filter(t => THEMES_MAP[t]).map(t => (
                  <span key={t} style={{
                    fontSize: "10px", padding: "1px 5px", borderRadius: "8px",
                    background: THEMES_MAP[t].color + "22", border: `0.5px solid ${THEMES_MAP[t].color}`, color: THEMES_MAP[t].color
                  }}>{THEMES_MAP[t].label}</span>
                ))}
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div style={{
            position: "fixed",
            bottom: selected ? "168px" : "40px",
            left: "12px",
            display: "flex", flexDirection: "column", gap: "4px",
            zIndex: 25,
          }}>
            {[["＋", 1.3, "Zoom in"], ["−", 0.77, "Zoom out"], ["⊡", null, "Fit all"]].map(([icon, factor, title]) => (
              <button key={icon} title={title}
                onClick={() => factor ? zoomBy(factor) : zoomToFit()}
                style={{
                  width: "28px", height: "28px", borderRadius: "6px",
                  background: DM.surface, border: `1px solid ${DM.border}`,
                  color: DM.textMuted, fontSize: icon === "⊡" ? "14px" : "16px",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", boxShadow: DM.shadow,
                  fontFamily: "system-ui, sans-serif", lineHeight: 1,
                }}>
                {icon}
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: "fixed",
            bottom: selected ? "168px" : "40px",
            left: "12px",
            display: "flex", flexDirection: "column", gap: "4px",
            zIndex: 25,
          }}>
            {[["＋", 1.3, "Zoom in"], ["−", 0.77, "Zoom out"], ["⊡", null, "Fit all"]].map(([icon, factor, title]) => (
              <button key={icon} title={title}
                onClick={() => factor ? zoomBy(factor) : zoomToFit()}
                style={{
                  width: "28px", height: "28px", borderRadius: "6px",
                  background: DM.surface, border: `1px solid ${DM.border}`,
                  color: DM.textMuted, fontSize: icon === "⊡" ? "14px" : "16px",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", boxShadow: DM.shadow,
                  fontFamily: "system-ui, sans-serif", lineHeight: 1,
                }}>
                {icon}
              </button>
            ))}
          </div>

          {/* Legend — desktop only */}
          {!isMobile && (
            <div style={{
              position: "fixed", bottom: selected ? "168px" : "40px", right: "12px",
              background: darkMode ? "rgba(30,32,40,0.97)" : "rgba(255,255,255,0.95)", border: `1px solid ${DM.border}`, borderRadius: "8px",
              padding: "10px 12px", fontSize: "10px", color: DM.textMuted, lineHeight: 1.9, zIndex: 25,
              boxShadow: DM.shadow
            }}>
              {Object.entries(THEMES_MAP).map(([key, val]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: val.color, display: "inline-block", opacity: 0.8 }} />
                  {val.label}
                </div>
              ))}
              <div style={{ marginTop: "6px", borderTop: "1px solid #f0f0f0", paddingTop: "6px", color: "#bbb" }}>
                ◌ dashed ring = hub article<br />
                pie segments = multiple themes<br />
                hover = highlight neighbours<br />
                drag · scroll to zoom · click for detail
              </div>
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div style={{ padding: isMobile ? "0" : "0 16px", maxWidth: "800px", margin: "0 auto" }}>
          {/* Recently added — articles from the past 30 days, only shown when no filters active */}
          {activeTheme === "all" && activeAuthor === "All authors" && !searchQuery && (() => {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            const recent = [...NODES]
              .filter(n => n.date && n.date >= cutoffStr)
              .sort((a, b) => b.date.localeCompare(a.date));
            if (recent.length === 0) return null;
            return (
              <div style={{ borderBottom: "0.5px solid #f0f0f0", padding: "10px 16px 12px" }}>
                <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Recently added — last 30 days
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {recent.map(n => (
                    <button key={n.id}
                      onClick={() => { setSelected(n); setHighlightId(n.id); lockedRef.current = n.id; updateUrl(n.id); setViewMode("graph"); setTimeout(() => { const liveNode = simNodesRef.current?.find(d => d.id === n.id); if (liveNode) zoomToNode(liveNode); }, 300); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        padding: "4px 8px", borderRadius: "6px", cursor: "pointer",
                        border: `1px solid ${getNodeColor(n, THEMES_MAP)}44`,
                        background: getNodeColor(n, THEMES_MAP) + "11",
                        fontSize: "11px", color: "#333",
                      }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: getNodeColor(n, THEMES_MAP), flexShrink: 0 }} />
                      {n.label}
                      <span style={{ fontSize: "9px", color: "#bbb", flexShrink: 0 }}>{n.date?.slice(0, 7)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{ padding: "10px 16px", fontSize: "11px", color: "#aaa", borderBottom: "0.5px solid #f0f0f0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span>{filteredNodes.length} article{filteredNodes.length !== 1 ? "s" : ""}</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: "11px", padding: "2px 6px", border: "0.5px solid #ddd", borderRadius: "6px", background: "white", color: "#666", fontFamily: "inherit", cursor: "pointer", marginLeft: "4px" }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most">Most connected</option>
              <option value="least">Least connected</option>
              <option value="az">A–Z</option>
            </select>
            {activeTheme !== "all" && (
              <span style={{ padding: "1px 7px", borderRadius: "10px", background: THEMES_MAP[activeTheme]?.color + "22", border: `0.5px solid ${THEMES_MAP[activeTheme]?.color}`, color: THEMES_MAP[activeTheme]?.color, fontSize: "10px" }}>
                {THEMES_MAP[activeTheme]?.label}
              </span>
            )}
            {activeAuthor !== "All authors" && (
              <span style={{ padding: "1px 7px", borderRadius: "10px", background: "#88888822", border: "0.5px solid #888", color: "#666", fontSize: "10px" }}>
                {activeAuthor}
              </span>
            )}
            {searchQuery && (
              <span style={{ padding: "1px 7px", borderRadius: "10px", background: "#37ADD122", border: "0.5px solid #378ADD", color: "#378ADD", fontSize: "10px" }}>
                "{searchQuery}"
              </span>
            )}
            {(activeTheme !== "all" || activeAuthor !== "All authors" || searchQuery) && (
              <button onClick={() => { setActiveTheme("all"); updateThemeUrl("all"); setActiveAuthor("All authors"); updateAuthorUrl("All authors"); setSearchQuery(""); setSearchResults([]); setShowThemeOverlay(false); }}
                style={{ fontSize: "10px", color: "#bbb", background: "none", border: "none", cursor: "pointer", padding: "0", marginLeft: "auto" }}>
                Clear filters ×
              </button>
            )}
          </div>
          {filteredNodes.map(n => (
            <div key={n.id}
              onClick={() => setSelected(n)}
              style={{
                padding: isMobile ? "14px 16px" : "12px 16px",
                borderBottom: "0.5px solid #f5f5f5", cursor: "pointer",
              }}
              onMouseEnter={e => { if (!isMobile) e.currentTarget.style.background = "#fafafa"; }}
              onMouseLeave={e => { if (!isMobile) e.currentTarget.style.background = "white"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getNodeColor(n, THEMES_MAP), display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: isMobile ? "14px" : "13px", color: "#111" }}>{n.title || n.label}</span>
                    {HUB_IDS.has(n.id) && <span style={{ fontSize: "9px", color: "#bbb" }}>◌ hub</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "#999", marginBottom: "4px", paddingLeft: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span>{n.label}</span>
                    {n.journal && <span style={{ color: "#bbb" }}>· {n.journal}</span>}
                    {n.date && !n.journal && <span style={{ color: "#ccc" }}>{n.date.slice(0, 7)}</span>}
                    {(sortBy === "most" || sortBy === "least") && (
                      <span style={{ color: "#ccc" }}>{DEGREES[n.id] || 0} connections</span>
                    )}
                  </div>
                  <div style={{ fontSize: isMobile ? "13px" : "12px", color: "#666", lineHeight: 1.5, paddingLeft: "14px", marginBottom: "5px" }}>
                    {n.desc}
                  </div>
                  <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", paddingLeft: "14px" }}>
                    {(n.topic || n.themes || []).filter(t => THEMES_MAP[t]).map(t => (
                      <span key={t} style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                        background: THEMES_MAP[t].color + "22", border: `0.5px solid ${THEMES_MAP[t].color}`,
                        color: THEMES_MAP[t].color
                      }}>{THEMES_MAP[t].label}</span>
                    ))}
                  </div>
                </div>
                {n.url && n.url !== "#" && (
                  <a href={n.url} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: "11px", color: "#378ADD", textDecoration: "none",
                      whiteSpace: "nowrap", flexShrink: 0, padding: isMobile ? "8px 0" : "2px 0",
                    }}>
                    Read →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        height: "28px", background: DM.surface,
        borderTop: `1px solid ${DM.border}`,
        display: "flex", alignItems: "center",
        padding: "0 12px", gap: "10px",
        fontSize: "10px", color: DM.textMuted,
        zIndex: 10,
      }}>
        <button onClick={() => setShowBibliography(p => !p)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: "10px", color: allBiblio.length ? DM.link : DM.textFaint, fontFamily: "inherit" }}>
          📚 Bibliography{allBiblio.length ? ` (${allBiblio.length})` : ""}
        </button>
        <span style={{ color: DM.textFaint }}>·</span>
        <button onClick={() => setShowMyNotes(p => !p)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: "10px", color: Object.keys(allNotes).length ? DM.link : DM.textFaint, fontFamily: "inherit" }}>
          📝 My notes{Object.keys(allNotes).length ? ` (${Object.keys(allNotes).length})` : ""}
        </button>
        <span style={{ color: DM.textFaint }}>·</span>
        <span>© knowledgemap contributors</span>
        <span style={{ color: DM.textFaint }}>·</span>
        <a href="https://github.com/tom-geraghty/knowledgemap" target="_blank" rel="noreferrer"
          style={{ color: DM.link, textDecoration: "none" }}>
          MIT licensed version ↗
        </a>
        <span style={{ color: DM.textFaint }}>·</span>
        <span>v{pkgJson.version}</span>
        <span style={{ color: DM.textFaint }}>·</span>
        <span style={{ position: "relative", display: "inline-block" }}
          onMouseEnter={() => setAboutTooltip(true)}
          onMouseLeave={() => setAboutTooltip(false)}>
          <span style={{ cursor: "help", borderBottom: `1px dotted ${DM.textMuted}` }}>
            About this map
          </span>
          {aboutTooltip && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
              transform: "translateX(-50%)",
              background: DM.surface, border: `1px solid ${DM.border}`,
              borderRadius: "8px", padding: "10px 12px",
              fontSize: "11px", color: DM.text, lineHeight: 1.6,
              width: "260px", boxShadow: DM.shadow, zIndex: 100,
              pointerEvents: "none",
            }}>
              A semantic knowledge map. Nodes are articles; links show conceptual relationships.
            </div>
          )}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>{darkMode ? "🌙" : "☀️"}</span>
          <button onClick={() => setDarkMode(d => { const next = !d; localStorage.setItem("km-dark-mode", next); return next; })}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              width: "32px", height: "16px", borderRadius: "8px", border: "none",
              background: darkMode ? "#378ADD" : "#cccccc",
              cursor: "pointer", position: "relative", padding: 0,
              transition: "background 0.2s",
            }}>
            <span style={{
              position: "absolute", top: "2px",
              left: darkMode ? "18px" : "2px",
              width: "12px", height: "12px", borderRadius: "50%",
              background: "#ffffff",
              transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {selected && <DetailPanel DM={DM} node={selected} onClose={() => { setSelected(null); setHighlightId(null); setTappedBoth(null); lockedRef.current = null; updateUrl(null); }} onSelectNode={(rel) => { setSelected(rel); setHighlightId(rel.id); lockedRef.current = rel.id; updateUrl(rel.id); const liveNode = simNodesRef.current?.find(d => d.id === rel.id); if (liveNode) zoomToNode(liveNode); }} copied={copied} setCopied={setCopied} getConnected={getConnected} isMobile={isMobile} THEMES_MAP={THEMES_MAP} HUB_IDS={HUB_IDS} DEGREES={DEGREES} ARTICLE_NODES={ARTICLE_NODES} PAPER_NODES={PAPER_NODES} getNodeColor={getNodeColor} onSelectPaper={() => {}} />}
    </div>
  );
}
