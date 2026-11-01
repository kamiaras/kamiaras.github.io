import { readFile, writeFile, mkdir, readdir, lstat, rm, cp, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from '../vendor/marked/marked.esm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const contentDirectory = path.join(root, 'content');
const site = JSON.parse(await readFile(path.join(root, 'site.json'), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pagePath = value => {
  if (typeof value !== 'string' || !/^\/(?:[a-z0-9-]+\/)*$/.test(value)) {
    throw new Error(`Page paths must be / or lower-case slugs ending in /: ${value}`);
  }
  return value;
};
const siteBase = new URL(site.url.endsWith('/') ? site.url : `${site.url}/`);
if (!['http:', 'https:'].includes(siteBase.protocol)) throw new Error('site.url must be an HTTP(S) URL.');
if (!site.name || !site.email || !Array.isArray(site.navigation)) throw new Error('site.json needs name, email and navigation.');
const navigation = site.navigation.map(item => ({ label: item.label, path: pagePath(item.path) }));
if (new Set(navigation.map(item => item.path)).size !== navigation.length) throw new Error('Navigation paths must be unique.');
const absolute = route => new URL(route.replace(/^\//, ''), siteBase).href;
const relative = (from, to) => {
  const fromDirectory = from === '/404.html' ? '/' : from;
  const result = path.posix.relative(fromDirectory, to);
  return result ? `${result}${to.endsWith('/') ? '/' : ''}` : './';
};
const currentYear = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date());

function document({ route, title, description = site.description, body, active = route, noindex = false, redirect = null, published = null }) {
  const fullTitle = route === '/' ? site.title || site.name : `${title} · ${site.name}`;
  const nav = navigation.map(item => `<a href="${escape(relative(route, item.path))}"${item.path === active ? ' aria-current="page"' : ''}>${escape(item.label)}</a>`).join('\n        ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#faf8f3">
  ${route === '/404.html' ? `<base href="${escape(siteBase.pathname)}">` : ''}
  <title>${escape(fullTitle)}</title>
  <meta name="description" content="${escape(description)}">
  <meta name="author" content="${escape(site.name)}">
  ${noindex ? '<meta name="robots" content="noindex">' : ''}
  ${redirect ? `<meta http-equiv="refresh" content="0; url=${escape(redirect)}">` : ''}
  <link rel="canonical" href="${escape(absolute(route))}">
  <meta property="og:type" content="${published ? 'article' : 'website'}">
  <meta property="og:title" content="${escape(fullTitle)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(absolute(route))}">
  <meta property="og:image" content="${escape(absolute('/assets/img/kamiar-asgari.jpg'))}">
  ${published ? `<meta property="article:published_time" content="${escape(published)}">` : ''}
  <link rel="icon" href="${escape(relative(route, '/assets/favicon.svg'))}" type="image/svg+xml">
  <link rel="stylesheet" href="${escape(relative(route, '/assets/style.css'))}">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="site-shell">
    <header class="site-header">
      <nav class="site-nav" aria-label="Main navigation">
        ${nav}
        <a id="cv-pdf" href="${escape(relative(route, '/assets/pdf/Kamiar-Asgari-CV.pdf'))}" download="Kamiar-Asgari-CV.pdf">CV PDF <span aria-hidden="true">↓</span></a>
      </nav>
    </header>
    <main id="main" class="site-main">
${body}
    </main>
    <footer class="site-footer">
      <span>© ${currentYear} ${escape(site.name)}</span>
      <div class="footer-links"><a href="${escape(relative(route, '/writing/'))}">Writing</a><a href="mailto:${escape(site.email)}">Email</a></div>
    </footer>
  </div>
</body>
</html>
`;
}

async function outputPage(route, html) {
  const target = route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1);
  const filename = path.join(output, target);
  if (!filename.startsWith(`${output}${path.sep}`)) throw new Error('Output path escaped dist.');
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, html, 'utf8');
}

function readPost(source, filename) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: begin with JSON metadata between --- lines. See README.`);
  let meta;
  try { meta = JSON.parse(match[1]); } catch (error) { throw new Error(`${filename}: invalid metadata JSON (${error.message})`); }
  if (meta.draft === true) return null;
  if (typeof meta.title !== 'string' || !meta.title.trim()) throw new Error(`${filename}: title is required.`);
  if (typeof meta.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${filename}: date must be YYYY-MM-DD.`);
  const parsedDate = new Date(`${meta.date}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== meta.date) throw new Error(`${filename}: date is not valid.`);
  const slug = meta.slug || filename.replace(/\.md$/i, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${filename}: slug must contain lower-case letters, numbers and hyphens.`);
  if (meta.type && !['note', 'essay'].includes(meta.type)) throw new Error(`${filename}: type must be note or essay.`);
  return { ...meta, slug, body: marked.parse(match[2]), route: `/writing/${slug}/`, prettyDate: new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(parsedDate) };
}

let postFiles = [];
try { postFiles = await readdir(path.join(contentDirectory, 'writing')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const posts = [];
for (const filename of postFiles.filter(name => name.endsWith('.md'))) {
  const post = readPost(await readFile(path.join(contentDirectory, 'writing', filename), 'utf8'), filename);
  if (post) posts.push(post);
}
posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
if (new Set(posts.map(post => post.slug)).size !== posts.length) throw new Error('Writing slugs must be unique.');

// This directory is build output owned by this script, never an arbitrary path.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unsafe build output path.');
let previousOutput;
try { previousOutput = await lstat(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previousOutput?.isSymbolicLink()) throw new Error('Refusing to replace a symlink at dist.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await copyFile(path.join(output, 'assets', 'pdf', 'Kamiar-Asgari-CV.pdf'), path.join(output, 'assets', 'pdf', 'CV_Kamiar_Asgari.pdf'));

function writingList(entries, from) {
  return `<ol class="writing-list post-list">${entries.map(post => `<li class="writing-entry"><div class="writing-entry-heading"><a class="writing-title post-title" href="${escape(relative(from, post.route))}">${escape(post.title)}</a><time class="post-date" datetime="${post.date}">${escape(post.prettyDate)}</time></div>${post.description ? `<p>${escape(post.description)}</p>` : ''}${post.type ? `<span class="writing-type post-kind">${escape(post.type)}</span>` : ''}</li>`).join('\n')}</ol>`;
}

const routes = [];
for (const page of navigation) {
  const slug = page.path === '/' ? 'index' : page.path.slice(1, -1);
  let body = await readFile(path.join(contentDirectory, `${slug}.html`), 'utf8');
  if (body.includes('<!-- RECENT_WRITING -->')) {
    body = body.replace('<!-- RECENT_WRITING -->', posts.length ? writingList(posts.slice(0, 3), page.path) : '<p>A place for notes, questions, and occasional longer essays. Nothing published yet.</p>');
  }
  if (page.path === '/writing/') {
    const list = posts.length
      ? writingList(posts, page.path)
      : '<div class="writing-empty"><p>No posts yet.</p><p>Notes and essays will appear here.</p></div>';
    if (!body.includes('<!-- WRITING_LIST -->')) throw new Error('content/writing.html needs <!-- WRITING_LIST -->.');
    body = body.replace('<!-- WRITING_LIST -->', list);
  }
  await outputPage(page.path, document({ route: page.path, title: page.label, body }));
  routes.push(page.path);
}

for (const post of posts) {
  const body = `<article class="writing-post">
  <a class="back-link" href="../">All writing</a>
  <header class="post-header"><p class="post-meta"><time datetime="${post.date}">${escape(post.prettyDate)}</time>${post.type ? ` · ${escape(post.type)}` : ''}</p><h1>${escape(post.title)}</h1>${post.description ? `<p class="page-intro">${escape(post.description)}</p>` : ''}</header>
  <div class="prose post-content">${post.body}</div>
</article>`;
  await outputPage(post.route, document({ route: post.route, title: post.title, description: post.description || site.description, body, active: '/writing/', published: post.date }));
  routes.push(post.route);
}

for (const [route, destination, label] of [['/cv/', '../assets/pdf/Kamiar-Asgari-CV.pdf', 'My CV is available as a PDF.'], ['/publications/', '../#research-heading', 'Selected research is now on my homepage.'], ['/blog/', '../writing/', 'My notes and essays are now under Writing.']]) {
  if (routes.includes(route)) continue;
  await outputPage(route, document({ route, title: 'Page moved', noindex: true, redirect: destination, body: `<h1>Page moved</h1><p>${label}</p><p><a href="${destination}"${route === '/cv/' ? ' download="Kamiar-Asgari-CV.pdf"' : ''}>${route === '/cv/' ? 'Download CV PDF' : 'Continue to the new page'}</a></p>` }));
}
await outputPage('/404.html', document({ route: '/404.html', title: 'Page not found', noindex: true, body: `<h1>Page not found</h1><p>This page may have moved.</p><p><a href="./">Return to the homepage</a></p>` }));
await writeFile(path.join(output, '.nojekyll'), '', 'utf8');
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap.xml')}\n`, 'utf8');
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${escape(absolute(route))}</loc></url>`).join('\n')}\n</urlset>\n`, 'utf8');
console.log(`Built ${routes.length} pages (${posts.length} writing posts) in ${output}`);
