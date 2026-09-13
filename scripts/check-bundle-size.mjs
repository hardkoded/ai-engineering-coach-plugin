import { statSync } from 'fs';
import { join } from 'path';

const BUDGETS_MB = { 'cli.cjs': 2, 'canvas-host.cjs': 2 };

let failed = false;
for (const [file, budget] of Object.entries(BUDGETS_MB)) {
  const path = join(import.meta.dirname, '..', 'dist', file);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    console.error(`Could not check dist/${file} — run npm run build first`);
    process.exit(1);
  }
  const mb = size / (1024 * 1024);
  console.log(`dist/${file}: ${mb.toFixed(2)} MB`);
  if (mb > budget) {
    console.error(`❌ dist/${file} exceeds ${budget}MB budget!`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('✅ Within budget');
