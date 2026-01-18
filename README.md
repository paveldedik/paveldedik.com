# Pavel Dedík's Personal Website

Modern, minimalist personal website built with Astro. Features monospace typography, clean design, and focuses on showcasing work experience and open source contributions.

## Tech Stack

- **Framework**: Astro 5.x
- **Language**: TypeScript (strict mode)
- **Styling**: Custom CSS with CSS variables
- **Fonts**: Berkeley Mono, IBM Plex Mono (with monospace fallbacks)
- **Output**: Static HTML (no client-side JavaScript)

## Prerequisites

- Node.js 18.x or higher
- npm (comes with Node.js)

## Local Development

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The site will be available at `http://localhost:4321`

### Build for Production

```bash
npm run build
```

The static files will be generated in the `./dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
/
├── public/              # Static assets (favicon, fonts, etc.)
├── src/
│   ├── layouts/         # Layout components
│   │   └── BaseLayout.astro
│   ├── pages/           # Routes (each file = one page)
│   │   ├── index.astro      # Home page (/)
│   │   ├── resume.astro     # Resume page (/resume)
│   │   └── contact.astro    # Contact page (/contact)
│   └── styles/          # Global CSS
│       └── global.css
├── package.json
└── astro.config.mjs
```

## Deployment

This site is automatically deployed to **GitHub Pages** using GitHub Actions.

### Automated Deployment (Recommended)

1. **Push to master branch**:
   ```bash
   git add .
   git commit -m "Update site"
   git push origin master
   ```

2. **GitHub Actions will automatically**:
   - Install dependencies
   - Build the site with `npm run build`
   - Deploy to GitHub Pages

3. **Your site will be live at**: `https://paveldedik.github.io/paveldedik.com/`

### Manual Deployment (Alternative)

If you need to deploy manually:

```bash
npm run deploy
```

This will build the site and remind you to push to the master branch.

### GitHub Pages Configuration

**Important**: Make sure GitHub Pages is configured in your repository settings:
1. Go to repository **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The site will deploy automatically on every push to master

### Build Details

- **Build Command**: `npm run build`
- **Output Directory**: `dist/`
- **Node Version**: 20.x
- **Workflow File**: `.github/workflows/deploy.yml`

## Customization

### Updating Content

- **Work Experience**: Edit `src/pages/resume.astro` (Work Experience section)
- **Open Source Projects**: Edit `src/pages/resume.astro` (Open Source Contributions section)
- **Contact Links**: Edit `src/pages/contact.astro`
- **Home Page**: Edit `src/pages/index.astro`

### Styling

All styles are in `src/styles/global.css`. The design uses CSS variables for easy theming:

```css
:root {
  --font-mono: "Berkeley Mono", "IBM Plex Mono", ...;
  --color-bg: #ffffff;
  --color-text: #000000;
  --color-text-secondary: #666666;
  --color-border: #e0e0e0;
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 2rem;
  --spacing-lg: 4rem;
  --max-width: 800px;
}
```

### Adding Fonts

To use Berkeley Mono or IBM Plex Mono fonts:

1. Place font files in `public/fonts/`
2. Add `@font-face` declarations in `src/styles/global.css`
3. The current setup gracefully falls back to system monospace fonts

## Commands Reference

| Command | Action |
|---------|--------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Build production site to `./dist/` |
| `npm run preview` | Preview production build locally |
| `npm run deploy` | Build and show deployment reminder |
| `npm run astro` | Run Astro CLI commands |

## License

Copyright © 2026 Pavel Dedík
