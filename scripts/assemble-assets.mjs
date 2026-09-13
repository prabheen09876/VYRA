import { mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'apps/worker/public');
await mkdir(target, { recursive: true });
// Wipe the previous capture drop first. Vite emits content-hashed filenames, so a plain recursive
// copy MERGES: every rebuild left another index-<hash>.js/.css behind, and those stale bundles
// (carrying the old palette) kept getting uploaded with the worker. Only `capture/` is removed —
// `models/` is a sibling holding the multi-megabyte pose model, which is downloaded separately and
// must survive.
await rm(resolve(target,'capture'), { recursive: true, force: true });
await cp(resolve(root,'apps/capture/dist'), resolve(target,'capture'), { recursive: true });
await mkdir(resolve(target,'models'), { recursive: true });
await mkdir(resolve(target,'brand'), { recursive: true });
await cp(resolve(root,'packages/brand/assets/logo.png'), resolve(target,'brand/logo.png'));
// Halo ground/text/brand, matching apps/mobile/src/theme.ts. The link is `brand` #2DD4BF at
// 10.83:1 on #05070A, well past 4.5:1 for body text.
await writeFile(resolve(target,'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#05070A"><link rel="icon" type="image/png" href="/brand/logo.png"><title>VYRA Arena</title><body style="background:#05070A;color:#F2F5F8;color-scheme:dark;font:18px system-ui;padding:8vw"><h1 style="display:flex;align-items:center;gap:16px"><img src="/brand/logo.png" alt="" width="56" height="56" style="object-fit:contain">VYRA Arena</h1><p>Your arena is online.</p><p>Open the VYRA app to create a battle, or <a style="color:#2DD4BF" href="/capture/?lab=1">record movement training data</a>.</p></body></html>');
console.log('Assembled capture page at /capture/; model files preserved at /models/.');
