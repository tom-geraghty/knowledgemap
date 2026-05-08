# Contributing to Knowledge Map

Thanks for your interest in contributing. This is a small, focused project — contributions that keep it simple and broadly useful are most welcome.

---

## Ways to contribute

- **Bug reports** — something broken? Please open an issue using the bug report template.
- **Feature requests** — have an idea? Open an issue using the feature request template. Check existing issues first to avoid duplicates.
- **Bug fixes** — PRs for confirmed bugs are very welcome.
- **Documentation improvements** — clearer README, better comments in the data files, fixes to typos or broken links.
- **New features** — please open an issue to discuss before starting work on anything significant. This avoids effort going into something that won't be merged.

---

## Getting started locally

```bash
git clone https://github.com/tom-geraghty/knowledgemap.git
cd knowledgemap
npm install
npm run dev
```

The app runs at `http://localhost:5173`. Any changes to `src/` hot-reload automatically.

---

## Before submitting a PR

1. **Run validation** — `npm run validate` must pass with no errors (warnings are ok if justified)
2. **Run a build** — `npm run build` must complete without errors
3. **Keep it focused** — one fix or feature per PR
4. **Update the README** if your change affects how someone would use or configure the tool

---

## Data structure

All content lives in `src/data/`. If your contribution touches the data format, please update the comments in those files to reflect any changes.

The three files:

| File | Purpose |
|------|---------|
| `src/data/nodes.js` | Node definitions — articles, concepts, pages |
| `src/data/links.js` | Connections between nodes |
| `src/data/themes.js` | Theme definitions — colours, labels, descriptions |

See the comments in each file and the README for full field documentation.

---

## Code style

- The project uses React and D3 — no additional dependencies without discussion
- Formatting is not strictly enforced, but please match the style of the surrounding code
- Inline styles are used throughout (intentional — keeps the component self-contained)

---

## Licence

By contributing, you agree that your contributions will be licensed under the MIT licence that covers this project.
