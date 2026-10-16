/** How many dots fit in the indicator. Extra photos slide this window instead of adding dots. */
export const MAX_PHOTO_DOTS = 5;

const DOT = 10;
const GAP = 7;

/** Window of at most 5 dots. The current photo stays in the middle until the ends. */
export function photoDotWindow(index: number, count: number, max = MAX_PHOTO_DOTS) {
  const size = Math.min(count, max);
  const start =
    count <= max ? 0 : Math.min(Math.max(index - Math.floor(max / 2), 0), count - max);
  return { start, size };
}

function dotScale(i: number, index: number, count: number, start: number, size: number) {
  if (i === index) return 1;
  const slot = i - start;
  const moreBefore = start > 0 && slot === 0;
  const moreAfter = start + size < count && slot === size - 1;
  if (moreBefore || moreAfter) return 0.55;
  return 0.7;
}

/** Instagram-style photo position. Hidden when there is only one photo. */
export function PhotoDots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null;
  const safe = Math.min(Math.max(index, 0), count - 1);
  const { start, size } = photoDotWindow(safe, count);
  const width = size * DOT + (size - 1) * GAP;

  return (
    <div className="overflow-hidden" style={{ width }} aria-hidden>
      <div
        className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ gap: GAP, transform: `translateX(-${start * (DOT + GAP)}px)` }}
      >
        {Array.from({ length: count }, (_, i) => {
          const active = i === safe;
          return (
            <span
              key={i}
              data-photo-dot={i}
              data-active={active ? "true" : undefined}
              className="block shrink-0 rounded-full bg-ivory transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{
                width: DOT,
                height: DOT,
                opacity: active ? 1 : 0.9,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.55)",
                transform: `scale(${dotScale(i, safe, count, start, size)})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
