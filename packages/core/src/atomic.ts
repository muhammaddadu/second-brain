/**
 * Atomic file write: temp-file → fsync → rename over target. Per ADR 0002, this is the vault's
 * durability primitive — a reader observes only the old bytes or the new bytes, never a torn
 * splice. The temp file is created in the target's own directory so the rename stays within one
 * filesystem (cross-device rename is not atomic).
 */
import { mkdir, open, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

let sequence = 0;

/** Write `data` to `filePath` atomically, creating parent directories as needed. */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  // pid + monotonic sequence keeps concurrent writers (even in one process) from colliding.
  sequence += 1;
  const tempPath = join(dir, `.${basename(filePath)}.${process.pid}.${sequence}.tmp`);
  const handle = await open(tempPath, 'w');
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
}
