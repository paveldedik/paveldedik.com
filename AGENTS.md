# Agent Guidelines for paveldedik.com

This document provides coding agents with essential information about this codebase.

## Project Overview

- **Type**: Static personal portfolio website
- **Framework**: Astro 5.16.11 (Static Site Generator)
- **Language**: TypeScript with strict mode
- **Package Manager**: npm
- **Node Version**: 18.x+ (CI uses 20.x)
- **Deployment**: Cloudflare Pages (project `paveldedik`) via GitHub Actions on push to `master`
- **Infra**: Terraform in `terraform/`, one module per hostname, state in the `paveldedik-tfstate` R2 bucket

## Project Structure

```
paveldedik.com/              ← repo root
├── .env  backend.hcl        # gitignored, shared by every Terraform module
├── .github/workflows/       # MUST stay here — Actions only reads .github at the toplevel
├── root/                    # the apex site (paveldedik.com): the Astro project
│   ├── src/layouts/         # Layout components (BaseLayout.astro)
│   ├── src/pages/           # Page routes (index, work, opensource, contact)
│   ├── src/styles/          # Global CSS (global.css)
│   ├── public/              # Static assets (favicon, keybase.txt)
│   └── dist/  .astro/       # Build output and Astro cache (gitignored)
└── terraform/
    └── root/                # paveldedik.com + www → state key root/terraform.tfstate
```

**The site is in `root/`, not at the repo root.** `npm`, `astro` and `wrangler`
all run from `root/`; paths below (`src/...`) are relative to it. A future
subdomain is a sibling directory of `root/` plus a sibling module of
`terraform/root/` and its own job in `.github/workflows/deploy.yml`. `README.md`
is the runbook for Terraform and lists what in the zone is managed by hand.

## Build, Test & Development Commands

Run all of these from `root/`.

### Development
```bash
npm run dev         # Start dev server at http://localhost:4321
npm run preview     # Preview production build locally
```

### Build & Deploy
```bash
npm run build       # Build for production (outputs to dist/)
npm run deploy      # Build + manual `wrangler pages deploy` (needs `source ../.env`)
```

### Astro CLI
```bash
npm run astro -- <command>    # Direct access to Astro CLI
```

### Testing & Linting
- **No test framework configured** - This is a simple static site with no tests
- **No ESLint/Prettier configured** - Manual code style enforcement
- Manual testing via `npm run dev` and browser inspection

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** - Extends `astro/tsconfigs/strict`
- **No explicit type annotations in simple cases** - Let TypeScript infer when obvious
- **Interface over type** - Use `interface` for component props (e.g., `interface Props`)
- **Optional properties** - Use `?` for optional props with defaults in destructuring

Example:
```typescript
interface Props {
  title: string;
  description?: string;
}

const { title, description = "Default description" } = Astro.props;
```

### Astro Components

**File structure:**
1. Frontmatter (TypeScript) at top between `---` delimiters
2. HTML/component markup below

**Imports:**
- Use relative imports for local files (`'../layouts/BaseLayout.astro'`)
- Import global CSS in BaseLayout only (`import '../styles/global.css'`)
- No client-side JavaScript - pure static SSG approach

**Component naming:**
- PascalCase for component files (e.g., `BaseLayout.astro`)
- Lowercase for page routes (e.g., `index.astro`, `work.astro`)

Example structure:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Page Title">
  <h1>Content</h1>
</BaseLayout>
```

### CSS Styling

**Global approach:**
- All styles in `src/styles/global.css`
- No CSS-in-JS or scoped styles
- Use CSS custom properties (CSS variables) defined in `:root`

**CSS Variables:**
```css
--font-mono: "Berkeley Mono", "IBM Plex Mono", ...
--color-bg, --color-text, --color-text-secondary, --color-border
--color-pastel-blue, --color-pastel-green, --color-pastel-purple, --color-pastel-peach
--spacing-xs (0.5rem), --spacing-sm (1rem), --spacing-md (2rem), --spacing-lg (4rem), --spacing-xl (6rem)
--max-width: 800px
```

**Naming conventions:**
- BEM-like class names where appropriate (`.experience-item`, `.project-item`, `.meta-tag`)
- Semantic class names (`.container`, `.description`, `.contact-links`)
- Modifier classes (`.meta-tag.current`, `.contact-link.github`)

**Color usage:**
- Use pastel colors for accents and interactive elements
- Navigation items use nth-child selectors for different colors
- Meta tags and contact links have specific color variants

### HTML & Accessibility

- Semantic HTML elements (`<nav>`, `<main>`, `<section>`)
- External links include `target="_blank" rel="noopener noreferrer"`
- Proper meta tags (charset, viewport, description)
- Single-page app navigation via standard `<a>` tags (handled by Astro)

### Formatting

**Indentation:**
- 2 spaces (no tabs)

**Line length:**
- No strict limit, but keep reasonable (~100-120 chars)

**Quotes:**
- Double quotes for HTML attributes
- Single quotes for JavaScript/TypeScript imports

**Spacing:**
- Blank line between frontmatter sections and HTML
- Blank line between major sections in CSS
- Spacing follows Prettier defaults (though not enforced)

## Naming Conventions

### Files
- `kebab-case.astro` for pages
- `PascalCase.astro` for layouts/components
- `lowercase.css` for stylesheets

### Variables & Props
- `camelCase` for variables and props
- `PascalCase` for component names and interfaces
- `kebab-case` for CSS classes
- `--kebab-case` for CSS custom properties

### Classes
- Descriptive, semantic names (`.experience-item`, not `.ei`)
- State/modifier classes with compound names (`.meta-tag.current`)
- Layout classes are simple (`.container`)

## Error Handling

- Minimal error handling needed (static site)
- TypeScript strict mode catches type errors at build time
- Build failures visible in GitHub Actions CI
- 404s handled by Cloudflare Pages default behavior

## Development Workflow

1. **Make changes** - Edit files in `src/`
2. **Test locally** - `npm run dev` and verify in browser
3. **Build** - `npm run build` to check for build errors
4. **Commit & push** - Push to `master` triggers auto-deployment

## Deployment

- **Automatic** - `.github/workflows/deploy.yml` builds `root/` and runs
  `wrangler pages deploy` on push to `master` (direct upload)
- **Target** - Cloudflare Pages project `paveldedik`; `--branch=master` must
  match the project's `production_branch` or the upload becomes a preview
- **Domain** - Owned by `terraform/root` (apex CNAME, `www` 301, domain
  binding). Terraform is not involved in a content change
- **Secrets** - CI reads `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from
  GitHub secrets; Terraform reads the gitignored `.env`. Never commit either

## Terraform rules

- `source .env`, then `terraform init -backend-config=../../backend.hcl` inside
  the module directory.
- Steady-state plans must be `No changes`. `terraform/root` declares only the
  apex and `www` records — abort any plan that touches mail or another hostname.
- Never change a module's backend `key` without migrating state.
- Don't hardcode the `*.pages.dev` host; read `cloudflare_pages_project.*.subdomain`.
- Populate a Pages project before binding a domain to it.

## Important Constraints

- **No dynamic content** - Pure static site, no API routes or server-side logic
- **No client-side JS** - All interactivity is CSS-based (hover effects, transitions)
- **No testing** - Simple enough to not require automated tests
- **Single dependency** - Only Astro, no additional packages
- **Mobile-first responsive** - Media query at 768px breakpoint

## Common Tasks

### Adding a new page
1. Create `src/pages/newpage.astro`
2. Use `BaseLayout` component with appropriate props
3. Add navigation link in `src/layouts/BaseLayout.astro`
4. Update navigation CSS in `global.css` if needed

### Modifying styles
- Edit `src/styles/global.css` directly
- Use existing CSS variables where possible
- Follow existing pattern for new components

### Updating content
- Edit relevant `.astro` page file in `src/pages/`
- Content is in the HTML section (below `---` delimiters)
- Use semantic HTML and existing CSS classes
