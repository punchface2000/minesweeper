import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg');
const full = (size) => sharp(svg, { density: 384 }).resize(size, size);

await full(192).png().toFile('public/icon-192.png');
await full(512).png().toFile('public/icon-512.png');
// iOS home screen icons are not masked by transparency; use a flat square
await sharp(svg, { density: 384 }).resize(180, 180).flatten({ background: '#0f1115' }).png().toFile('public/apple-touch-icon.png');
// maskable: shrink the artwork into the safe zone on a solid background
const inner = await sharp(svg, { density: 384 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0f1115' } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile('public/icon-512-maskable.png');
console.log('icons done');
