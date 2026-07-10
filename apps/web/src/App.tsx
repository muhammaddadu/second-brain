import { useEffect, useMemo, useState } from 'react';
import { Download } from './components/Download';
import { Footer } from './components/Footer';
import { Gallery } from './components/Gallery';
import { Hero } from './components/Hero';
import { Nav } from './components/Nav';
import { Product } from './components/Product';
import { StarCta } from './components/StarCta';
import { ValueProps } from './components/ValueProps';
import { Vision } from './components/Vision';
import {
  detectPlatform,
  fetchLatestRelease,
  type PlatformId,
  RELEASES_URL,
  type ReleaseInfo,
} from './lib/downloads';
import { ThemeProvider } from './lib/theme';

function primaryCta(
  release: ReleaseInfo | null,
  detected: PlatformId,
): {
  href: string;
  label: string;
} {
  if (!release) {
    return { href: '#download', label: 'Download for your OS' };
  }
  const match =
    release.downloads.find((d) => d.id === detected) ??
    release.downloads.find((d) => d.id.startsWith('mac') && detected.startsWith('mac')) ??
    release.downloads[0];
  if (!match) {
    return { href: RELEASES_URL, label: 'Download' };
  }
  const short =
    match.id === 'mac-arm64' || match.id === 'mac-x64'
      ? 'Download for macOS'
      : match.id === 'windows'
        ? 'Download for Windows'
        : match.id === 'linux'
          ? 'Download for Linux'
          : 'Download';
  return { href: match.url, label: short };
}

function AppShell() {
  const detected = useMemo(() => detectPlatform(), []);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease().then((info) => {
      if (!cancelled) {
        setRelease(info);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cta = primaryCta(release, detected);

  return (
    <div id="top" className="paper-grain min-h-screen bg-paper text-ink">
      <Nav />
      <main>
        <Hero primaryDownloadHref={cta.href} primaryDownloadLabel={cta.label} />
        <Vision />
        <ValueProps />
        <Gallery />
        <Product />
        <Download release={release} detected={detected} loading={loading} />
        <StarCta />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
