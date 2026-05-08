# Knowledge Map

An open-source interactive semantic knowledge graph for exploring connections between articles, concepts, and ideas in a knowledge base.

Built with React and D3. Originally developed for [psychsafety.com](https://psychsafety.com) and open-sourced as a reusable template. The demo uses classic films as example data — directors are used as the "author" field to show the filtering functionality.

**[Live demo →](https://knowledgemap.onrender.com)**

---

## What it does

- Force-directed graph of nodes (articles/concepts) connected by edges (relationships)
- Filter by theme, author, or search
- Click a node to see its description, connections, and a link to the source article
- Featured images fetched automatically from WordPress REST API (if your site uses WordPress)
- Shareable URLs: `?node=your-node-id`, `?slug=your-slug`, `?theme=your-theme`
- List view with sort options (most connected, newest, A–Z)
- Mobile responsive

---

## Getting started

```bash
git clone https://github.com/tom-geraghty/knowledgemap.git
cd knowledgemap
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

---

## Adding your content

All content lives in three files in `src/data/`:

### `src/data/themes.js`

Defines the categories nodes can belong to. Each theme has a colour, a display label, and a short description shown when the theme is clicked.

```js
export const THEMES = {
  "your-theme": {
    color: "#378ADD",
    label: "Your Theme",
    desc: "A short description shown in the theme overlay panel when someone clicks the theme filter."
  },
};
```

### `src/data/nodes.js`

Each node is an article, page, or concept.

| Field | Description |
|-------|-------------|
| `id` | Unique slug — used in URLs and link references |
| `label` | Display name in the graph |
| `author` | Author name (enables the author filter) |
| `themes` | Array of theme ids — first theme sets the node colour |
| `weight` | Visual size 1–10. Use 8–10 for hub/central nodes. |
| `desc` | 35–50 word description. Write what the piece *argues*, not just its topic. |
| `url` | Full URL of the article. Use `"#"` if no URL yet. |
| `slug` | URL slug (used for WordPress featured image fetching and `?slug=` links) |
| `date` | Publication date `YYYY-MM-DD` (used for "recently added" badge) |

**Writing good descriptions:** State what the piece argues, not just what it covers. Name any specific target (a paper, model, concept) if the piece critically engages with one. Third person, no "this article explores..." — 35–50 words is the sweet spot.

### `src/data/links.js`

Connects two nodes. Strength 1–3 (loose → close).

```js
{ source: "node-id-a", target: "node-id-b", strength: 2 },
```

Add each link once only — duplicates trigger a validation warning.

---

## Validation

```bash
npm run validate
```

Checks for: duplicate node ids, duplicate links, orphan nodes, missing theme references, and slug/URL consistency.

---

## Deploying

Builds to a static site — deploy anywhere that serves static files.

**Render (recommended):**
1. Push to GitHub
2. New Static Site on [render.com](https://render.com)
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Auto-deploys on every push to `main`

Netlify, Vercel, and GitHub Pages all work with the same build command.

---

## WordPress integration

If your site runs WordPress, the app automatically fetches the featured image for each article on node click, via the WP REST API:

```
/wp-json/wp/v2/posts?slug={slug}&_embed=true
```

No configuration needed — just ensure your `slug` fields match your WordPress post slugs.

---

## Customising

- **Colours:** Edit the `color` field in `themes.js`
- **Title / meta:** Edit `index.html`
- **Favicon:** Replace `/public/favicon.png` or update `<link rel="icon">` in `index.html`
- **Graph physics:** D3 force simulation config is in `src/components/Network.jsx`

---

## Licence

MIT

---

## Credits

Built by [Tom Geraghty](https://tomgeraghty.co.uk) / [Iterum Ltd](https://iterum.co.uk) with Claude (Anthropic).
Originally developed for [psychsafety.com](https://psychsafety.com).
