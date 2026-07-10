import { describe, expect, it } from 'vitest';
import { pickAssetName, resolveDownloads } from './downloads';

const NAMES = [
  'latest-mac.yml',
  'second-brain-production-0.1.0-arm64.dmg',
  'second-brain-production-0.1.0-arm64.dmg.blockmap',
  'second-brain-production-0.1.0-x64.dmg',
  'second-brain-production-0.1.0.exe',
  'second-brain-production-0.1.0-x64.exe',
  'second-brain-production-0.1.0-arm64.exe',
  'second-brain-production-0.1.0-x86_64.AppImage',
  'second-brain-production-0.1.0-arm64.AppImage',
];

describe('pickAssetName', () => {
  it('picks platform installers and skips blockmaps/yml', () => {
    expect(pickAssetName('mac-arm64', NAMES)).toBe('second-brain-production-0.1.0-arm64.dmg');
    expect(pickAssetName('mac-x64', NAMES)).toBe('second-brain-production-0.1.0-x64.dmg');
    expect(pickAssetName('windows', NAMES)).toBe('second-brain-production-0.1.0.exe');
    expect(pickAssetName('linux', NAMES)).toBe('second-brain-production-0.1.0-x86_64.AppImage');
  });
});

describe('resolveDownloads', () => {
  it('maps each platform to a direct download URL', () => {
    const assets = NAMES.filter((n) => !n.includes('blockmap') && !n.endsWith('.yml')).map(
      (name) => ({
        name,
        browser_download_url: `https://github.com/example/releases/download/v0.1.0/${name}`,
      }),
    );
    const resolved = resolveDownloads(assets);
    expect(resolved.map((d) => d.id)).toEqual(['mac-arm64', 'mac-x64', 'windows', 'linux']);
    expect(resolved.every((d) => d.url.includes(d.fileName))).toBe(true);
  });
});
