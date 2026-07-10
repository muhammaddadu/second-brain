import { asset } from '../lib/assets';

type ShotProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  width?: number;
  height?: number;
};

export function Shot({
  src,
  alt,
  className = '',
  loading = 'lazy',
  width = 1280,
  height = 839,
}: ShotProps) {
  return (
    <figure className={`shot-frame ${className}`}>
      <img
        src={asset(src)}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
      />
    </figure>
  );
}
