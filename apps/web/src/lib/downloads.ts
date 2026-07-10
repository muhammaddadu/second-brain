export const GITHUB_REPO = 'muhammaddadu/second-brain';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;
export const STAR_URL = GITHUB_URL;

export type PlatformId = 'mac-arm64' | 'mac-x64' | 'windows' | 'linux' | 'unknown';

export type DownloadOption = {
  id: PlatformId;
  label: string;
  detail: string;
};

export const DOWNLOAD_OPTIONS: DownloadOption[] = [
  { id: 'mac-arm64', label: 'macOS', detail: 'Apple Silicon · .dmg' },
  { id: 'mac-x64', label: 'macOS', detail: 'Intel · .dmg' },
  { id: 'windows', label: 'Windows', detail: 'Installer · .exe' },
  { id: 'linux', label: 'Linux', detail: 'AppImage' },
];

/** Pick the best asset name for a platform from a release asset list. */
export function pickAssetName(platform: PlatformId, names: string[]): string | null {
  const files = names.filter((n) => !n.includes('blockmap') && !n.endsWith('.yml'));

  switch (platform) {
    case 'mac-arm64':
      return files.find((n) => /arm64\.dmg$/i.test(n)) ?? null;
    case 'mac-x64':
      return files.find((n) => /x64\.dmg$/i.test(n)) ?? null;
    case 'windows': {
      // Prefer the arch-agnostic installer, then x64, then any .exe.
      return (
        files.find((n) => /production-\d+\.\d+\.\d+\.exe$/i.test(n)) ??
        files.find((n) => /x64\.exe$/i.test(n)) ??
        files.find((n) => /\.exe$/i.test(n)) ??
        null
      );
    }
    case 'linux':
      return (
        files.find((n) => /x86_64\.AppImage$/i.test(n)) ??
        files.find((n) => /amd64\.AppImage$/i.test(n)) ??
        files.find((n) => /\.AppImage$/i.test(n)) ??
        null
      );
    default:
      return null;
  }
}

export function detectPlatform(): PlatformId {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';

  if (/Mac|iPhone|iPad|iPod/i.test(ua) || platform.startsWith('Mac')) {
    const anyNav = navigator as Navigator & {
      userAgentData?: { architecture?: string };
    };
    const arch = anyNav.userAgentData?.architecture;
    if (arch === 'x86' || arch === 'x86_64') return 'mac-x64';
    return 'mac-arm64';
  }
  if (/Win/i.test(ua) || platform.startsWith('Win')) return 'windows';
  if (/Linux/i.test(ua) || platform.startsWith('Linux')) return 'linux';
  return 'unknown';
}

type GhAsset = { name: string; browser_download_url: string };
type GhRelease = { tag_name: string; assets: GhAsset[]; html_url: string };

export type ResolvedDownload = DownloadOption & {
  url: string;
  fileName: string;
};

export type ReleaseInfo = {
  tag: string;
  htmlUrl: string;
  downloads: ResolvedDownload[];
};

export function resolveDownloads(assets: GhAsset[]): ResolvedDownload[] {
  const names = assets.map((a) => a.name);
  const byName = new Map(assets.map((a) => [a.name, a]));
  const downloads: ResolvedDownload[] = [];

  for (const option of DOWNLOAD_OPTIONS) {
    const fileName = pickAssetName(option.id, names);
    if (!fileName) continue;
    const asset = byName.get(fileName);
    if (!asset) continue;
    downloads.push({
      ...option,
      url: asset.browser_download_url,
      fileName: asset.name,
    });
  }
  return downloads;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GhRelease;
    return {
      tag: data.tag_name,
      htmlUrl: data.html_url,
      downloads: resolveDownloads(data.assets),
    };
  } catch {
    return null;
  }
}
