# Kamiar's personal website

A small static website with Home and Writing pages. A shared **CV PDF ↓** link beside Home and Writing in the top navigation downloads the full current CV directly; there is no separate CV webpage. The browser receives ordinary HTML and CSS, with no framework or account system. The updated CV and portrait are local assets.

## Preview on your computer

Use Node.js 20 or newer. No package installation is needed; the Markdown parser is included with its license.

```sh
npm run build
npm run preview
```

Open the `Local:` address printed by the preview server (normally `http://127.0.0.1:4173/`). The server only listens on your computer by default. Keep it running while viewing the preview; press Ctrl+C to stop it. To use a different port:

```sh
npm run preview -- --port 4174
```

Run the build again after editing, then refresh the preview. Generated files are in `dist/`; edit the sources, not that directory.

## Edit content

- `site.json`: your name, email, site description, published URL, and navigation.
- `content/index.html`: homepage introduction, links, and selected work.
- `content/writing.html`: writing-page introduction and the `<!-- WRITING_LIST -->` marker.
- `assets/style.css`: shared visual design.
- `assets/img/kamiar-asgari.jpg`: portrait.
- `assets/pdf/Kamiar-Asgari-CV.pdf`: full downloadable CV.

The content files are HTML fragments. The builder adds the shared page header, navigation, footer, and metadata.

## Add a note or essay

Create a Markdown file inside `content/writing/`, such as `an-interesting-question.md`. Begin it with JSON metadata between `---` lines:

```markdown
---
{
  "title": "An interesting question",
  "date": "2026-11-01",
  "type": "note",
  "description": "A brief description of the piece."
}
---

Your writing goes here. Use **bold**, [links](https://example.com),
lists, images, and other Markdown formatting.

## A section within the piece

Continue writing here.
```

The title and date are required. `type` can be `note` or `essay`; the description is optional. Dates use `YYYY-MM-DD`. The filename becomes the URL slug, or you can add a `slug` field. Use lowercase letters, digits, and hyphens in slugs. The example above would appear at `/writing/an-interesting-question/`.

Add `"draft": true` to metadata to keep a piece out of the built website. Posts are listed newest first. No sample posts are published with this site. Markdown is trusted author content and can include HTML.

Images stored in the shared assets folder can be referenced from a post as `../../assets/img/your-image.jpg`.

## Add a navigation tab

Add a navigation entry to `site.json`, for example:

```json
{ "label": "Projects", "path": "/projects/" }
```

Then create `content/projects.html`. Build again; the page and navigation link are generated together. Page paths must use lowercase slugs and end in `/`. Existing links use relative paths, so the generated site also works below a GitHub project subpath. Set `site.json`'s `url` to the actual published base URL, including that subpath if applicable, for correct canonical URLs and sitemap entries.

## Publish to GitHub Pages

To publish site edits, commit the source files, including `.github/workflows/pages.yml`, and push to the site's source branch. Do not commit `dist/`; the workflow generates it.

In the repository's **Settings → Pages**, use **GitHub Actions** as the publishing source. The included workflow builds and publishes when changes are pushed to `main` or `master`, or when the workflow is manually run.

Old CV/publication routes lead visitors to the new homepage or its direct CV PDF, while `/blog/` redirects to Writing. The old PDF filenames can be retained in `assets/pdf/` for existing paper links. All remaining theme demonstration pages and sample posts are absent from this replacement.

GitHub workflow reference: [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Keep the downloadable CV current automatically

Update the private CV source and push the changes. The automation compiles the CV, saves a private PDF artifact, and publishes only the finished PDF to this website repository. The site's normal Pages build then updates the **CV PDF ↓** download.

The private LaTeX source, drafts, build notes, and credentials stay outside this public repository. There is no HTML CV page to update separately. The automation skips commits when the PDF is unchanged.

## Included software

The build uses [Marked](https://github.com/markedjs/marked), version 17.0.5, vendored in `vendor/marked/` under its MIT license. No third-party JavaScript is downloaded or executed by visitors.
