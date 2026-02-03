import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../public/og-image.svg');
const pngPath = join(__dirname, '../public/og-image.png');

const svgContent = readFileSync(svgPath);

sharp(svgContent)
  .resize(1200, 630)
  .png()
  .toFile(pngPath)
  .then(() => console.log('OG image generated successfully at', pngPath))
  .catch(err => console.error('Error generating OG image:', err));
