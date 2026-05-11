import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { THEMES } from "../data/themes";
import { RAW_NODES } from "../data/nodes";
import { RAW_LINKS } from "../data/links";

// ── Configuration ─────────────────────────────────────────────────────────────
// If your articles are on a WordPress site, set this to your site's base URL.
// Set to null to disable featured image fetching.
const WORDPRESS_BASE_URL = null; // e.g. "https://yoursite.com"
// ─────────────────────────────────────────────────────────────────────────────

const seenIds = new Set();
const NODES = RAW_NODES.filter(n => {
  if (seenIds.has(n.id)) return false;
  seenIds.add(n.id);
  return true;
});

const AUTHORS = ["All authors", ...new Set(RAW_NODES.map(n => n.author).filter(Boolean).sort())];

function getNodeColor(node) {
  return node.themes[0] ? (THEMES[node.themes[0]]?.color || "#888") : "#888";
}

function getNodeDomain(node) {
  if (!node.url || node.url === "#") return "primary";


  for (const domain of EXTERNAL_DOMAINS) {
    if (node.url.includes(domain)) return domain;
  }
  return "primary";
}

// Add any external domains here — their nodes will render with a dashed border.
const EXTERNAL_DOMAINS = [];

const DOMAIN_STYLE = {
  primary: { dash: null, strokeWidth: 1.5 },
};

function getDomainStyle(domain) {
  return DOMAIN_STYLE[domain] || { dash: "5,3", strokeWidth: 2 };
}

function renderMultiThemeNode(selection, getR) {
  selection.each(function (d) {
    const g = d3.select(this);
    const r = getR(d);
    const themes = d.themes.filter(t => THEMES[t]);
    if (themes.length <= 1) {
      const ds = getDomainStyle(getNodeDomain(d));
      const circ = g.append("circle")
        .attr("r", r).attr("fill", THEMES[themes[0]]?.color || "#888")
        .attr("fill-opacity", 0.2).attr("stroke", THEMES[themes[0]]?.color || "#888")
        .attr("stroke-width", ds.strokeWidth).attr("class", "node-circle");
      if (ds.dash) circ.attr("stroke-dasharray", ds.dash);
    } else {
      const pie = d3.pie().value(1).sort(null);
      const arc = d3.arc().innerRadius(0).outerRadius(r);
      pie(themes).forEach((slice, i) => {
        const color = THEMES[themes[i]]?.color || "#888";
        g.append("path").attr("d", arc(slice)).attr("fill", color)
          .attr("fill-opacity", 0.25).attr("stroke", color)
          .attr("stroke-width", 0.5).attr("class", "node-circle");
      });
      const ds2 = getDomainStyle(getNodeDomain(d));
      const ring = g.append("circle").attr("r", r).attr("fill", "none")
        .attr("stroke", THEMES[themes[0]]?.color || "#888")
        .attr("stroke-width", ds2.strokeWidth).attr("class", "node-circle");
      if (ds2.dash) ring.attr("stroke-dasharray", ds2.dash);
    }
  });
}

function buildNeighbours() {
  const map = {};
  NODES.forEach(n => { map[n.id] = new Set(); });
  RAW_LINKS.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (map[s]) map[s].add(t);
    if (map[t]) map[t].add(s);
  });
  return map;
}

function buildDegrees() {
  const deg = {};
  NODES.forEach(n => { deg[n.id] = 0; });
  RAW_LINKS.forEach(l => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (deg[s] !== undefined) deg[s]++;
    if (deg[t] !== undefined) deg[t]++;
  });
  return deg;
}

const NEIGHBOURS = buildNeighbours();
const DEGREES = buildDegrees();
const TOP_N = 10;
const HUB_IDS = new Set(Object.entries(DEGREES).sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([id]) => id));

// Node radius — larger on mobile for touch targets
function nodeR(d, isMobile) {
  return isMobile ? 12 + d.weight * 2 : 7 + d.weight * 1.5;
}

export default function Network() {
  // Read ?node= or ?slug= from URL on load — must be defined before first use
  const getInitialNodeFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get("node");
    const slug = params.get("slug");
    if (nodeId) return NODES.find(n => n.id === nodeId) || null;
    if (slug) return NODES.find(n => n.slug === slug) || null;
    return null;
  };
  const initialNode = getInitialNodeFromUrl();

  const getInitialThemeFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("theme");
    return t && THEMES[t] ? t : "all";
  };
  const initialTheme = getInitialThemeFromUrl();

  const svgRef = useRef(null);
  const tappedRef = useRef(null);
  const lockedRef = useRef(initialNode?.id || null); // locked = selected via click/URL
  const zoomRef = useRef(null);      // d3 zoom behaviour
  const gRef = useRef(null);         // d3 group element
  const simNodesRef = useRef([]);    // live simulation nodes (mutated in place by D3)
  const [activeTheme, setActiveTheme] = useState(initialTheme);
  const [activeAuthor, setActiveAuthor] = useState("All authors");
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
    NODES.forEach(n => { const p = n.themes[0]; if (p) counts[p] = (counts[p] || 0) + 1; });
    return counts;
  }, []);

  const authorCounts = useMemo(() => {
    const counts = {};
    NODES.forEach(n => { counts[n.author] = (counts[n.author] || 0) + 1; });
    return counts;
  }, []);

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

  const zoomToNode = useCallback((node) => {
    if (!svgRef.current || !zoomRef.current || !gRef.current) return;
    if (!node.x || !node.y) return;
    const svg = d3.select(svgRef.current);
    const W = svgRef.current.clientWidth || window.innerWidth;
    const H = svgRef.current.clientHeight || window.innerHeight - 130;
    const scale = 1.8;
    const tx = W / 2 - scale * node.x;
    const ty = H / 2 - scale * node.y;
    svg.transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }, []);

  const zoomToTheme = useCallback((themeId) => {
    if (!svgRef.current || !zoomRef.current) return;
    const liveNodes = simNodesRef.current
      .filter(d => d.themes?.includes(themeId) && d.x != null && d.y != null);
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

  const handleTheme = useCallback((t) => {
    if (t === "all") {
      setActiveTheme("all"); updateThemeUrl("all");
      setShowThemeOverlay(false);
    } else {
      setActiveTheme(t); updateThemeUrl(t);
      setShowThemeOverlay(true);
      setTimeout(() => zoomToTheme(t), 50);
    }
    setSelected(null); setTappedBoth(null); setHighlightId(null);
  }, [updateThemeUrl, zoomToTheme]);
  const handleAuthor = useCallback((a) => { setActiveAuthor(a); setSelected(null); setTappedBoth(null); setHighlightId(null); }, []);

  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setHighlightId(null); return; }
    const lower = q.toLowerCase();
    setSearchResults(NODES.filter(n =>
      n.label.toLowerCase().includes(lower) ||
      n.desc.toLowerCase().includes(lower) ||
      n.author.toLowerCase().includes(lower)
    ).slice(0, 8));
  }, []);

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
    const themeOk = activeTheme === "all" || node.themes.includes(activeTheme);
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
  }, [isNodeVisible, highlightId]);

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
  }, [isNodeVisible, highlightId]);

  useEffect(() => {
    if (viewMode !== "graph") return;
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth || window.innerWidth;
    const H = window.innerHeight - 130;
    const nodes = NODES.map(n => ({ ...n }));
    const links = RAW_LINKS.map(l => ({ ...l }));
    const svg = d3.select(el).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();
    const g = svg.append("g");
    gRef.current = g;
    simNodesRef.current = nodes;

    svg.call(d3.zoom()
      .scaleExtent([0.1, 4])
      .touchable(true)
      .on("zoom", e => g.attr("transform", e.transform)));

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => 100 - (d.strength || 1) * 8).strength(d => (d.strength || 1) * 0.1))
      .force("charge", d3.forceManyBody().strength(d => -120 - d.weight * 10))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide().radius(d => (isMobile ? 28 : 22) + d.weight * 2));

    const linkSel = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", "#ccc").attr("stroke-width", d => (d.strength || 1) * 0.8)
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

    renderMultiThemeNode(nodeG, d => nodeR(d, isMobile));

    nodeG.filter(d => HUB_IDS.has(d.id)).append("circle")
      .attr("r", d => nodeR(d, isMobile) + 4).attr("fill", "none")
      .attr("stroke", d => getNodeColor(d)).attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,2").attr("opacity", 0.4).attr("class", "node-circle");

    const labelSel = nodeG.append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", d => isMobile ? Math.max(9, 8 + d.weight * 0.4) : Math.max(8, 7 + d.weight * 0.3))
      .attr("fill", "#444").attr("opacity", 0.9)
      .attr("pointer-events", "none").attr("class", "node-label");

    labelSel.each(function (d) {
      const el2 = d3.select(this);
      const words = d.label.split(" ");
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
      }, 2500);
    }
    sim.on("tick", () => {
      linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
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
  }, [viewMode, isMobile]);

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
        .attr("stroke", isActive ? "#999" : "#ccc");
    });
  }, [getNodeOpacity, getLinkOpacity]);

  const getConnected = (node) => {
    if (!node) return [];
    return RAW_LINKS
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
      const themeOk = activeTheme === "all" || n.themes.includes(activeTheme);
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
  }, [activeTheme, activeAuthor, searchQuery, sortBy]);

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

  const DetailPanel = ({ node, onClose }) => {
    const connected = getConnected(node);
    const [featuredImage, setFeaturedImage] = useState(null);

    useEffect(() => {
      setFeaturedImage(null);
      if (!node.slug || !WORDPRESS_BASE_URL) return;
      fetch(`${WORDPRESS_BASE_URL}/wp-json/wp/v2/posts?slug=${node.slug}&_embed=true`)
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
        background: "white", borderTop: "1px solid #eee",
        padding: isMobile ? "16px" : "12px 16px",
        zIndex: 30, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
        maxHeight: isMobile ? "60vh" : "auto",
        overflowY: isMobile ? "auto" : "visible",
      }}>
        {isMobile && (
          <div style={{ width: "40px", height: "4px", background: "#ddd", borderRadius: "2px", margin: "0 auto 12px" }} />
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, maxWidth: "800px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: getNodeColor(node), display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: isMobile ? "16px" : "15px", color: "#111" }}>{node.label}</span>
              {HUB_IDS.has(node.id) && (
                <span style={{ fontSize: "10px", color: "#bbb" }}>· {DEGREES[node.id]} connections</span>
              )}
            </div>
            <div style={{ display: "flex", gap: isMobile ? "0" : "16px", flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
              {featuredImage && node.url && node.url !== "#" && (
                <a href={node.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block", marginBottom: isMobile ? "10px" : "0" }}>
                  <img src={featuredImage} alt={node.label}
                    style={{ width: isMobile ? "100%" : "140px", height: isMobile ? "140px" : "90px",
                      objectFit: "cover", borderRadius: "6px", display: "block",
                      border: "1px solid #eee", transition: "opacity 0.15s",
                    }}
                    onMouseOver={e => e.target.style.opacity = "0.85"}
                    onMouseOut={e => e.target.style.opacity = "1"}
                  />
                </a>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#888" }}>{node.author}</span>
                  <span style={{ color: "#ddd", margin: "0 2px" }}>·</span>
                  {node.themes.filter(t => THEMES[t]).map(t => (
                    <span key={t} style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                      background: THEMES[t].color + "22", border: `0.5px solid ${THEMES[t].color}`,
                      color: THEMES[t].color, fontWeight: 500
                    }}>{THEMES[t].label}</span>
                  ))}
                </div>
                <div style={{ fontSize: isMobile ? "14px" : "13px", color: "#444", lineHeight: 1.6, marginBottom: "8px" }}>
                  {node.desc}
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
                  {node.url && node.url !== "#" && (
                    <a href={node.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: "13px", color: "#378ADD", textDecoration: "none", fontWeight: 500 }}>
                      Read article →
                    </a>
                  )}
                  <span style={{ fontSize: "11px", color: "#bbb" }}>
                    {connected.length} connection{connected.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
            {connected.length > 0 && (
              <div style={{ marginTop: "4px" }}>
                <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                  Related articles
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {connected.slice(0, isMobile ? 3 : 5).map(rel => (
                    <button key={rel.id}
                      onClick={() => {
                        setSelected(rel);
                        setHighlightId(rel.id);
                        lockedRef.current = rel.id;
                        updateUrl(rel.id);
                        const liveNode = simNodesRef.current?.find(d => d.id === rel.id);
                        if (liveNode) zoomToNode(liveNode);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        padding: "4px 8px", borderRadius: "6px", cursor: "pointer",
                        border: `1px solid ${getNodeColor(rel)}44`,
                        background: getNodeColor(rel) + "11",
                        fontSize: "11px", color: "#333", fontWeight: 400,
                        textAlign: "left", maxWidth: isMobile ? "140px" : "180px",
                      }}
                      title={rel.desc}
                    >
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: getNodeColor(rel), opacity: 0.8 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rel.label}
                      </span>
                      {rel.strength === 3 && <span style={{ fontSize: "9px", color: "#aaa", flexShrink: 0 }}>●●●</span>}
                      {rel.strength === 2 && <span style={{ fontSize: "9px", color: "#ccc", flexShrink: 0 }}>●●</span>}
                    </button>
                  ))}
                  {connected.length > (isMobile ? 3 : 5) && (
                    <span style={{ fontSize: "11px", color: "#bbb", alignSelf: "center" }}>
                      +{connected.length - (isMobile ? 3 : 5)} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0, marginLeft: "12px" }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              title="Copy link to this article"
              style={{ fontSize: "11px", padding: isMobile ? "8px 12px" : "4px 10px",
                cursor: "pointer", borderRadius: "8px", border: "1px solid #ddd",
                background: copied ? "#f0f9f0" : "transparent",
                color: copied ? "#2a7a2a" : "#888",
                minHeight: isMobile ? "44px" : "auto", whiteSpace: "nowrap",
              }}>
              {copied ? "✓ Copied" : "Copy link"}
            </button>
            <button onClick={onClose} style={{
              fontSize: "20px", lineHeight: 1, padding: isMobile ? "8px 12px" : "4px 8px",
              cursor: "pointer", borderRadius: "8px",
              border: "1px solid #eee", background: "transparent", color: "#888",
              minWidth: isMobile ? "44px" : "auto", minHeight: isMobile ? "44px" : "auto",
            }}>×</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: isMobile ? "10px 12px 8px" : "10px 14px 8px", borderBottom: "1px solid #eee" }}>

        {/* Title + view toggle + search */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px", flexWrap: "wrap" }}>
          {!isMobile && (
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#111", whiteSpace: "nowrap" }}>
              Knowledge Network
            </span>
          )}
          {!isMobile && (
            <span style={{ fontSize: "10px", color: "#ccc", whiteSpace: "nowrap" }}>
              {NODES.length} articles · {RAW_LINKS.length} connections · beta
            </span>
          )}

          {/* View mode toggle */}
          <div style={{
            display: "flex", borderRadius: "20px", border: "1px solid #ddd",
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
          {(activeTheme !== "all" || activeAuthor !== "All authors" || searchQuery || selected) && (
            <button onClick={() => {
              setActiveTheme("all"); updateThemeUrl("all");
              setActiveAuthor("All authors");
              setSelected(null); setHighlightId(null);
              setTappedBoth(null); lockedRef.current = null;
              setSearchQuery(""); setSearchResults([]);
              updateUrl(null); setShowThemeOverlay(false);
            }} style={{
              fontSize: "11px", padding: isMobile ? "6px 12px" : "4px 10px",
              background: "transparent", border: "1px solid #ddd",
              borderRadius: "20px", cursor: "pointer", color: "#888",
              marginLeft: "6px", minHeight: isMobile ? "36px" : "auto",
            }}>
              ↺ Reset
            </button>
          )}

          <a href="mailto:your@email.com?subject=Knowledge Network feedback" style={{
            fontSize: "11px", padding: isMobile ? "6px 12px" : "4px 10px",
            border: "1px solid #ddd", borderRadius: "20px", color: "#888",
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
                border: "1px solid #ddd", borderRadius: "20px", outline: "none",
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
                background: "white", border: "1px solid #e5e5e5", borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50,
              }}>
                {searchResults.map(n => (
                  <div key={n.id} onClick={() => handleSelectSearch(n)}
                    style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "0.5px solid #f5f5f5", fontSize: "13px" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"}
                    onMouseLeave={e => e.currentTarget.style.background = "white"}>
                    <div style={{ fontWeight: 500, color: "#111", marginBottom: "2px" }}>{n.label}</div>
                    <div style={{ fontSize: "11px", color: "#888", marginBottom: "3px" }}>{n.author}</div>
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {n.themes.filter(t => THEMES[t]).map(t => (
                        <span key={t} style={{
                          fontSize: "9px", padding: "0 5px", borderRadius: "8px",
                          background: THEMES[t].color + "22", color: THEMES[t].color,
                          border: `0.5px solid ${THEMES[t].color}`
                        }}>{THEMES[t].label}</span>
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
          <div style={{
            display: "flex", gap: "4px", flexWrap: isMobile ? "nowrap" : "wrap",
            overflowX: isMobile ? "auto" : "visible",
            paddingBottom: isMobile ? "4px" : "0",
            marginBottom: "5px",
            WebkitOverflowScrolling: "touch",
          }}>
            <Pill color="#555" label="All" count={NODES.length} active={activeTheme === "all"} onClick={() => handleTheme("all")} />
            {Object.entries(THEMES).map(([key, val]) => (
              <Pill key={key} color={val.color} label={val.label} count={themeCounts[key] || 0}
                active={activeTheme === key} onClick={() => handleTheme(key)} />
            ))}
          </div>

          {/* Theme overlay */}
          {showThemeOverlay && activeTheme !== "all" && THEMES[activeTheme] && (() => {
            const t = THEMES[activeTheme];
            return (
              <div style={{
                position: "absolute", top: "100%", left: 0, zIndex: 50,
                background: "white", border: `1px solid ${t.color}44`,
                borderLeft: `3px solid ${t.color}`,
                borderRadius: "8px", padding: "12px 14px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
                maxWidth: isMobile ? "calc(100vw - 32px)" : "380px",
                marginTop: "4px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                  <span style={{
                    fontSize: "13px", fontWeight: 600, color: t.color,
                  }}>{t.label}</span>
                  <button onClick={() => setShowThemeOverlay(false)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#bbb", fontSize: "16px", lineHeight: 1, padding: "0 0 0 8px", flexShrink: 0,
                  }}>×</button>
                </div>
                <p style={{ fontSize: "12px", color: "#555", lineHeight: 1.6, margin: "0 0 8px 0" }}>
                  {t.desc}
                </p>
                <span style={{ fontSize: "11px", color: "#aaa" }}>
                  {themeCounts[activeTheme] || 0} articles
                </span>
              </div>
            );
          })()}
        </div>

        {/* Author filters — dropdown on mobile, pills on desktop */}
        {isMobile ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#bbb", flexShrink: 0 }}>Author:</span>
            <select value={activeAuthor} onChange={e => handleAuthor(e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", border: "1px solid #ddd",
                borderRadius: "8px", background: "white", color: "#444",
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
        <div style={{ padding: "4px 14px", background: "#fafafa", borderBottom: "0.5px solid #f0f0f0", display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#888" }}>
          <span>Showing:</span>
          <span style={{ padding: "1px 7px", borderRadius: "10px", background: THEMES[activeTheme]?.color + "22", border: `0.5px solid ${THEMES[activeTheme]?.color}`, color: THEMES[activeTheme]?.color, fontSize: "10px" }}>
            {THEMES[activeTheme]?.label}
          </span>
          <span style={{ color: "#ccc" }}>+</span>
          <span style={{ padding: "1px 7px", borderRadius: "10px", background: "#88888818", border: "0.5px solid #aaa", color: "#666", fontSize: "10px" }}>
            {activeAuthor}
          </span>
          <button onClick={() => { setActiveTheme("all"); updateThemeUrl("all"); setActiveAuthor("All authors"); setShowThemeOverlay(false); }}
            style={{ fontSize: "10px", color: "#bbb", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
            Clear ×
          </button>
        </div>
      )}

      {/* Graph view */}
      {viewMode === "graph" && (
        <div style={{ position: "relative" }}>
          <svg ref={svgRef} style={{ width: "100%", display: "block" }} />

          {/* Mobile first-tap hint */}
          {isMobile && tapped && !selected && (
            <div style={{
              position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)",
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
              background: "white", border: "1px solid #e5e5e5", borderRadius: "8px",
              padding: "8px 12px", fontSize: "12px", maxWidth: "220px",
              pointerEvents: "none", zIndex: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
            }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px", color: "#111" }}>{tooltip.node.label}</div>
              <div style={{ color: "#888", fontSize: "11px", marginBottom: "4px" }}>
                {tooltip.node.author}
                {HUB_IDS.has(tooltip.node.id) && <span style={{ color: "#bbb", marginLeft: "6px" }}>· {DEGREES[tooltip.node.id]} connections</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {tooltip.node.themes.filter(t => THEMES[t]).map(t => (
                  <span key={t} style={{
                    fontSize: "10px", padding: "1px 5px", borderRadius: "8px",
                    background: THEMES[t].color + "22", border: `0.5px solid ${THEMES[t].color}`, color: THEMES[t].color
                  }}>{THEMES[t].label}</span>
                ))}
              </div>
            </div>
          )}

          {/* Legend — desktop only */}
          {!isMobile && (
            <div style={{
              position: "fixed", bottom: selected ? "140px" : "12px", right: "12px",
              background: "rgba(255,255,255,0.95)", border: "1px solid #eee", borderRadius: "8px",
              padding: "10px 12px", fontSize: "10px", color: "#888", lineHeight: 1.9, zIndex: 25,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
            }}>
              {Object.entries(THEMES).map(([key, val]) => (
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
                        border: `1px solid ${getNodeColor(n)}44`,
                        background: getNodeColor(n) + "11",
                        fontSize: "11px", color: "#333",
                      }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: getNodeColor(n), flexShrink: 0 }} />
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
              <span style={{ padding: "1px 7px", borderRadius: "10px", background: THEMES[activeTheme]?.color + "22", border: `0.5px solid ${THEMES[activeTheme]?.color}`, color: THEMES[activeTheme]?.color, fontSize: "10px" }}>
                {THEMES[activeTheme]?.label}
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
              <button onClick={() => { setActiveTheme("all"); updateThemeUrl("all"); setActiveAuthor("All authors"); setSearchQuery(""); setSearchResults([]); setShowThemeOverlay(false); }}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getNodeColor(n), display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: isMobile ? "14px" : "13px", color: "#111" }}>{n.label}</span>
                    {HUB_IDS.has(n.id) && <span style={{ fontSize: "9px", color: "#bbb" }}>◌ hub</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "#999", marginBottom: "4px", paddingLeft: "14px", display: "flex", gap: "8px" }}>
                    <span>{n.author}</span>
                    {n.date && <span style={{ color: "#ccc" }}>{n.date.slice(0, 7)}</span>}
                    {(sortBy === "most" || sortBy === "least") && (
                      <span style={{ color: "#ccc" }}>{DEGREES[n.id] || 0} connections</span>
                    )}
                  </div>
                  <div style={{ fontSize: isMobile ? "13px" : "12px", color: "#666", lineHeight: 1.5, paddingLeft: "14px", marginBottom: "5px" }}>
                    {n.desc}
                  </div>
                  <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", paddingLeft: "14px" }}>
                    {n.themes.filter(t => THEMES[t]).map(t => (
                      <span key={t} style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                        background: THEMES[t].color + "22", border: `0.5px solid ${THEMES[t].color}`,
                        color: THEMES[t].color
                      }}>{THEMES[t].label}</span>
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

      {/* Detail panel */}
      {selected && <DetailPanel node={selected} onClose={() => { setSelected(null); setHighlightId(null); setTappedBoth(null); lockedRef.current = null; updateUrl(null); }} />}
    </div>
  );
}
