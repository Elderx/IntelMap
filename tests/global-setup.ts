import { promises as fs } from 'fs';
import path from 'path';

export default async () => {
  const nycOutputDir = path.join(process.cwd(), '.nyc_output');
  await fs.mkdir(nycOutputDir, { recursive: true });
};
