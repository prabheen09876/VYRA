/**
 * Scrape the exercise guides from simplyfitness.com into a local, committed dataset
 * plus locally downloaded illustrations. Every exercise page shares one deterministic
 * template, so this is a plain template parse (no HTML-parser dependency) — see
 * docs/exercise-catalog.md. Run `npm run exercises:scrape` to refresh, then
 * `npm run exercises:catalog` to regenerate the Worker catalog.
 *
 * `--check` runs a network-free audit of the already-committed dataset and images.
 *
 * Attribution: exercise text and illustrations are © Simply Fitness (simplyfitness.com),
 * fetched from public /pages/* guides that robots.txt allows. Nothing here ships secrets.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = resolve(root, 'data/exercises/exercises.json');
const IMAGE_DIR = resolve(root, 'apps/worker/public/exercise-images');
const IMAGE_ROUTE = '/exercise-images';
const SOURCE = 'https://www.simplyfitness.com';
const UA = 'VYRA-exercise-scraper/1.0 (local dev; +https://simplyfitness.com attribution)';
const CHECK = process.argv.includes('--check');

// The site's eight muscle-guide hubs are the canonical filter groups.
const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abdominals', 'legs', 'calves'];
// Muscle links point at /pages/<slug>; only `abs` needs folding into `abdominals`.
const SLUG_TO_GROUP = {
  chest: 'chest', back: 'back', shoulders: 'shoulders', biceps: 'biceps',
  triceps: 'triceps', abdominals: 'abdominals', abs: 'abdominals', legs: 'legs', calves: 'calves',
};
// Some pages name the muscle in plain text (no hub link). Longest, most specific keys first.
const LABEL_TO_GROUP = [
  ['pec', 'chest'], ['chest', 'chest'],
  ['trapez', 'back'], ['lower back', 'back'], ['upper back', 'back'], ['lat', 'back'], ['back', 'back'],
  ['deltoid', 'shoulders'], ['shoulder', 'shoulders'],
  ['tricep', 'triceps'],
  ['forearm', 'biceps'], ['bicep', 'biceps'],
  ['oblique', 'abdominals'], ['abdominal', 'abdominals'], ['lumbar', 'abdominals'], ['core', 'abdominals'], ['abs', 'abdominals'],
  ['calf', 'calves'], ['calves', 'calves'],
  ['quadricep', 'legs'], ['hamstring', 'legs'], ['glute', 'legs'], ['buttock', 'legs'],
  ['thigh', 'legs'], ['abductor', 'legs'], ['adductor', 'legs'], ['hip', 'legs'], ['leg', 'legs'],
];
function labelGroup(text) {
  const lower = text.toLowerCase();
  for (const [keyword, group] of LABEL_TO_GROUP) if (lower.includes(keyword)) return group;
  return null;
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', times: '×',
};
function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const codePoint = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

async function fetchText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' } });
      if (response.ok) return await response.text();
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const { item, index } = queue.shift();
      results[index] = await worker(item, index);
      await sleep(120);
    }
  }));
  return results;
}

const slugOf = url => url.split('/pages/')[1]?.replace(/[/?#].*$/, '') ?? '';
const imageExt = src => (/\.([a-z0-9]+)(?:\?|$)/i.exec(src)?.[1] ?? 'png').toLowerCase();
const grab = (re, html) => (re.exec(html)?.[1] ?? '').trim();
function afterH3(content, label) {
  const match = new RegExp(`<h3>\\s*${label}[^<]*</h3>`, 'i').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(/<h3>/i);
  return next === -1 ? rest : rest.slice(0, next);
}
function richText(inner) {
  const text = decode(inner
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
  return text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').trim();
}
function musclesFrom(block) {
  const groups = []; const labels = [];
  const links = [...block.matchAll(/\/pages\/([a-z0-9-]+)"[^>]*>([^<]+)</g)];
  if (links.length) {
    for (const [, slug, label] of links) {
      const group = SLUG_TO_GROUP[slug];
      labels.push(decode(label).trim());
      if (group && !groups.includes(group)) groups.push(group);
    }
  } else {
    const text = decode(grab(/<span>([\s\S]*?)<\/span>/, block).replace(/<[^>]+>/g, '')).trim();
    if (text) {
      labels.push(text);
      const group = labelGroup(text);
      if (group) groups.push(group);
    }
  }
  return { groups, labels: labels.filter(Boolean) };
}

/** Parse one page; returns an exercise record or null when the page is a hub/tool. */
function parseExercise(url, html) {
  const name = decode(grab(/<h1 class="exo-h1">([\s\S]*?)<\/h1>/, html));
  const hasSteps = /<h3>\s*Starting position/i.test(html) && /<h3>\s*Execution/i.test(html);
  if (!name || !hasSteps) return null; // hubs, calculators and contact-us lack the step guide
  const headerIndex = html.indexOf('exo-h1');
  const header = html.slice(html.lastIndexOf('<header', headerIndex), html.indexOf('<section class="exo-content'));
  const imageSource = /<img\s+src="(https:\/\/cdn\.shopify\.com[^"]+)"/i.exec(header)?.[1] ?? null;
  const content = html.slice(html.indexOf('<section class="exo-content'), html.indexOf('</main>'));
  const main = musclesFrom(afterH3(content, 'Main muscles'));
  const secondary = musclesFrom(afterH3(content, 'Secondary muscles'));
  const equipmentText = decode(grab(/<span>([\s\S]*?)<\/span>/, afterH3(content, 'Equipment required')).replace(/<[^>]+>/g, '')).trim();
  const equipment = equipmentText && !/^(none|no equipment|bodyweight)$/i.test(equipmentText)
    ? equipmentText.split(',').map(item => item.trim()).filter(Boolean) : [];
  return {
    slug: slugOf(url),
    name,
    url,
    subtitle: decode(grab(/<p class="lead">([\s\S]*?)<\/p>/, html)),
    primaryMuscles: main.groups,
    secondaryMuscles: secondary.groups.filter(group => !main.groups.includes(group)),
    muscleLabels: main.labels,
    equipment,
    startingPosition: richText(afterH3(content, 'Starting position')),
    execution: richText(afterH3(content, 'Execution')),
    image: imageSource ? `${IMAGE_ROUTE}/${slugOf(url)}.${imageExt(imageSource)}` : null,
    imageSource,
  };
}

/** Prefer the full-resolution master (drop Shopify's `_600x600` size suffix and `?v=` cache key). */
function masterUrl(src) {
  return src.replace(/(_\d+x\d+)?(\.[a-z]+)(\?.*)?$/i, '$2');
}
function looksLikeImage(bytes, contentType) {
  if (bytes.length <= 500 || bytes.length >= 5_000_000) return false;
  if ((contentType ?? '').startsWith('image/')) return true;
  const head = bytes.subarray(0, 6).toString('latin1');
  return (bytes[0] === 0x89 && bytes[1] === 0x50) // PNG
    || (bytes[0] === 0xff && bytes[1] === 0xd8) // JPEG
    || head.startsWith('GIF8') || head.startsWith('RIFF') // GIF / WEBP
    || /^\s*<(\?xml|svg)/i.test(head); // SVG
}
async function downloadImage(record) {
  const target = resolve(IMAGE_DIR, record.image.split('/').pop());
  try {
    const existing = await stat(target);
    if (existing.size > 500) return 'skipped';
  } catch { /* not present yet */ }
  for (const url of [masterUrl(record.imageSource), record.imageSource]) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!looksLikeImage(bytes, response.headers.get('content-type'))) continue;
      await writeFile(target, bytes);
      return 'downloaded';
    } catch { /* try fallback url */ }
  }
  return 'failed';
}

async function scrape() {
  const index = await fetchText(`${SOURCE}/sitemap.xml`);
  const pagesSitemap = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
    .find(u => /sitemap_pages_1\.xml/.test(u) && !/\/(es|fr|de|it)\//.test(u));
  if (!pagesSitemap) throw new Error('Could not locate the pages sitemap.');
  const pagesXml = await fetchText(pagesSitemap);
  const urls = [...pagesXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    .filter(u => /\/pages\//.test(u) && !/\/(es|fr|de|it)\//.test(u));
  console.log(`Fetched sitemap: ${urls.length} candidate pages.`);

  const parsed = await mapPool(urls, 6, async url => {
    const html = await fetchText(url);
    if (!html) { console.warn(`  ! no HTML for ${url}`); return null; }
    const record = parseExercise(url, html);
    if (record) console.log(`  + ${record.slug} [${record.primaryMuscles.join(', ') || '??'}]`);
    return record;
  });
  const exercises = parsed.filter(Boolean).sort((a, b) => a.slug.localeCompare(b.slug));
  const skipped = urls.length - exercises.length;
  console.log(`Parsed ${exercises.length} exercises (${skipped} non-exercise pages skipped).`);

  const withoutPrimary = exercises.filter(e => !e.primaryMuscles.length);
  if (withoutPrimary.length) throw new Error(`Exercises without a muscle group: ${withoutPrimary.map(e => e.slug).join(', ')}`);

  const perGroup = Object.fromEntries(GROUPS.map(g => [g, exercises.filter(e => e.primaryMuscles.includes(g)).length]));
  console.log(`Primary group counts: ${JSON.stringify(perGroup)}`);

  // Persist the parsed dataset first; a transient image failure must not lose the parse.
  await mkdir(dirname(DATA_PATH), { recursive: true });
  const dataset = { source: `${SOURCE}/`, scrapedAt: new Date().toISOString(), count: exercises.length, groups: GROUPS, exercises };
  await writeFile(DATA_PATH, JSON.stringify(dataset, null, 2) + '\n');
  console.log(`Wrote ${exercises.length} exercises to ${DATA_PATH}.`);

  await mkdir(IMAGE_DIR, { recursive: true });
  const toDownload = exercises.filter(e => e.imageSource);
  const outcomes = await mapPool(toDownload, 6, downloadImage);
  const tally = outcomes.reduce((acc, o) => ((acc[o] = (acc[o] ?? 0) + 1), acc), {});
  const failed = toDownload.filter((e, i) => outcomes[i] === 'failed');
  console.log(`Images: ${JSON.stringify(tally)}${failed.length ? ` — failed: ${failed.map(e => e.slug).join(', ')}` : ''}`);
  const noImage = exercises.filter(e => !e.imageSource);
  if (noImage.length) console.log(`No source illustration for: ${noImage.map(e => e.slug).join(', ')} (image left null).`);
  console.log('Next: npm run exercises:catalog');
  if (failed.length) throw new Error('Some illustrations failed to download.');
}

async function check() {
  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const problems = [];
  if (!Array.isArray(dataset.exercises) || dataset.exercises.length < 140) problems.push(`Expected >=140 exercises, found ${dataset.exercises?.length}`);
  const slugs = new Set();
  for (const e of dataset.exercises ?? []) {
    for (const field of ['slug', 'name', 'subtitle', 'startingPosition', 'execution']) if (!e[field]) problems.push(`${e.slug || '?'}: missing ${field}`);
    if (slugs.has(e.slug)) problems.push(`Duplicate slug ${e.slug}`);
    slugs.add(e.slug);
    if (!e.primaryMuscles?.length) problems.push(`${e.slug}: no primary muscle group`);
    if (e.primaryMuscles?.some(g => !GROUPS.includes(g))) problems.push(`${e.slug}: unknown muscle group`);
    if (e.image) {
      try {
        const info = await stat(resolve(root, `apps/worker/public${e.image}`));
        if (info.size < 500) problems.push(`${e.slug}: image too small`);
      } catch { problems.push(`${e.slug}: missing image file ${e.image}`); }
    }
  }
  const onDisk = (await readdir(IMAGE_DIR).catch(() => [])).filter(name => name.endsWith('.png'));
  const referenced = new Set(dataset.exercises.filter(e => e.image).map(e => `${e.slug}.png`));
  for (const file of onDisk) if (!referenced.has(file)) problems.push(`Orphan image not in dataset: ${file}`);
  console.log(JSON.stringify({ ok: problems.length === 0, exercises: dataset.exercises.length, images: onDisk.length, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
}

await (CHECK ? check() : scrape()).catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
