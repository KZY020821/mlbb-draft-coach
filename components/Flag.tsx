// Small country flags for the league picker, drawn inline so they look the same on every device
// (Windows does not draw flag emoji). Simplified, at 3:2.

// Malaysia's 14-point star, as one polygon.
function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

function Malaysia() {
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} y={(i * 20) / 14} width="30" height={20 / 14} fill={i % 2 ? "#fff" : "#cc0001"} />
      ))}
      <rect width="15" height={(20 * 8) / 14} fill="#010066" />
      <circle cx="6.4" cy="5.7" r="3.9" fill="#fc0" />
      <circle cx="7.5" cy="5.7" r="3.3" fill="#010066" />
      <polygon points={starPoints(11.4, 5.7, 2.7, 1.1, 14)} fill="#fc0" />
    </>
  );
}

function Indonesia() {
  return (
    <>
      <rect width="30" height="10" fill="#ce1126" />
      <rect y="10" width="30" height="10" fill="#fff" />
    </>
  );
}

function Philippines() {
  return (
    <>
      <rect width="30" height="10" fill="#0038a8" />
      <rect y="10" width="30" height="10" fill="#ce1126" />
      <polygon points="0,0 17.3,10 0,20" fill="#fff" />
      <circle cx="6.2" cy="10" r="2.3" fill="#fcd116" />
      <circle cx="1.9" cy="2.7" r="0.85" fill="#fcd116" />
      <circle cx="1.9" cy="17.3" r="0.85" fill="#fcd116" />
      <circle cx="14.3" cy="10" r="0.85" fill="#fcd116" />
    </>
  );
}

const FLAGS: Record<string, () => React.ReactElement> = { my: Malaysia, id: Indonesia, ph: Philippines };

export default function Flag({ league, size = 24 }: { league: string; size?: number }) {
  const Draw = FLAGS[league];
  if (!Draw) return null;
  return (
    <svg className="flag" width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden="true">
      <clipPath id={`flag-${league}`}>
        <rect width="30" height="20" rx="3" />
      </clipPath>
      <g clipPath={`url(#flag-${league})`}>
        <Draw />
      </g>
    </svg>
  );
}
