interface CardThumbnailProps {
  src: string;
  alt: string;
  className?: string;
}

export function CardThumbnail({ src, alt, className }: CardThumbnailProps) {
  return (
    <div className="group relative shrink-0">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={
          className ??
          "h-32 w-[5.5rem] cursor-zoom-in rounded-xl border border-zinc-700 bg-zinc-950 object-cover shadow-md transition group-hover:border-amber-400/50"
        }
      />
      <div
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 group-hover:block"
        aria-hidden
      >
        <img
          src={src}
          alt=""
          className="max-h-[28rem] w-auto max-w-[14rem] rounded-xl border border-zinc-600 bg-zinc-950 shadow-2xl ring-1 ring-black/40"
        />
      </div>
    </div>
  );
}
