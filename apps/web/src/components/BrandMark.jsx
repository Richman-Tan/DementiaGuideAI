// The DementiaGuide AI "Companion" mark — two overlapping circles, one solid
// and one outlined. Geometry comes from @core/brand/mark.js so the web app, the
// mobile app and the icon generator can never drift apart; the only thing this
// file decides is how to turn it into SVG.
//
//   <BrandMark />            bare mark, tinted with --primary / --primary-l
//   <BrandMark tile />       reversed out of a teal rounded square (the lockup)
import React from 'react';
import { MARK, MARK_REVERSED, MARK_COLORS, TILE, markBounds, markViewBox } from '@core/brand/mark';

function Circles({ mark, colors }) {
  return (
    <>
      <circle cx={mark.solid.cx} cy={mark.solid.cy} r={mark.solid.r} fill={colors.solid} />
      <circle
        cx={mark.ring.cx}
        cy={mark.ring.cy}
        r={mark.ring.r}
        fill="none"
        stroke={colors.ring}
        strokeWidth={mark.ring.strokeWidth}
      />
    </>
  );
}

export default function BrandMark({ size = 36, tile = false, title = 'DementiaGuide AI', style }) {
  const mark = tile ? MARK_REVERSED : MARK;
  const bounds = markBounds(mark);
  // The viewBox is cropped to the mark's own bounding box, so the mark fills the
  // element exactly — it is not centred inside its 48-unit space and centring on
  // 24,24 would sit it visibly right of centre.
  const width = tile ? size * TILE.markWidthRatio : size;
  const height = width / (bounds.width / bounds.height);

  const svg = (
    <svg
      width={width}
      height={height}
      viewBox={markViewBox(mark)}
      role="img"
      aria-label={tile ? undefined : title}
      aria-hidden={tile ? 'true' : undefined}
    >
      <Circles
        mark={mark}
        colors={tile ? MARK_COLORS.onTile : { solid: 'var(--primary)', ring: 'var(--primary-l)' }}
      />
    </svg>
  );

  if (!tile) return svg;

  return (
    <span
      role="img"
      aria-label={title}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${size * TILE.radiusRatio}px`,
        background: 'var(--primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0',
        ...style,
      }}
    >
      {svg}
    </span>
  );
}
