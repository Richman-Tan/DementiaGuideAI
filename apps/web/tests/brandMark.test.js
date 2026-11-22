// The brand mark component (components/BrandMark.jsx). The geometry is shared
// with mobile and the icon generator (@core/brand/mark); what is tested here is
// how the web component turns it into accessible SVG in its two forms: the bare
// mark, tinted from the live theme, and the reversed-out tile the app shell uses.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BrandMark from '../src/components/BrandMark.jsx';
import { MARK, MARK_REVERSED, TILE, markBounds, markViewBox } from '@core/brand/mark';

const html = (props) => renderToStaticMarkup(React.createElement(BrandMark, props));
const attr = (markup, tag, name) =>
  markup.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`))?.[1];

describe('the bare mark', () => {
  it('is a labelled image tinted from the theme, sized to the mark’s own bounds', () => {
    const out = html({ size: 48, title: 'DementiaGuide AI home' });
    const b = markBounds(MARK);

    expect(out.startsWith('<svg')).toBe(true); // no tile wrapper
    expect(attr(out, 'svg', 'role')).toBe('img');
    expect(attr(out, 'svg', 'aria-label')).toBe('DementiaGuide AI home');
    expect(out).not.toContain('aria-hidden');
    expect(attr(out, 'svg', 'viewBox')).toBe(markViewBox(MARK));
    expect(Number(attr(out, 'svg', 'width'))).toBe(48);
    expect(Number(attr(out, 'svg', 'height'))).toBeCloseTo(48 / (b.width / b.height), 6);
    // Theme colours, not the fixed on-tile white — so dark mode and high
    // contrast re-tint it with the rest of the UI.
    expect(out).toContain('fill="var(--primary)"');
    expect(out).toContain('stroke="var(--primary-l)"');
    expect(out).toContain(`stroke-width="${MARK.ring.strokeWidth}"`);
  });

  it('defaults to 36 px with the product name as its label', () => {
    const out = html({});
    expect(Number(attr(out, 'svg', 'width'))).toBe(36);
    expect(attr(out, 'svg', 'aria-label')).toBe('DementiaGuide AI');
  });
});

describe('the tile', () => {
  it('labels the tile, hides the inner SVG from assistive tech, and uses the reversed ring', () => {
    const out = html({ size: 40, tile: true, title: 'Home', style: { marginBottom: '14px' } });

    expect(out.startsWith('<span')).toBe(true);
    expect(attr(out, 'span', 'role')).toBe('img');
    expect(attr(out, 'span', 'aria-label')).toBe('Home');
    expect(attr(out, 'svg', 'aria-hidden')).toBe('true');
    expect(attr(out, 'svg', 'aria-label')).toBeUndefined();
    expect(Number(attr(out, 'svg', 'width'))).toBeCloseTo(40 * TILE.markWidthRatio, 6);
    expect(out).toContain(`stroke-width="${MARK_REVERSED.ring.strokeWidth}"`);
    expect(out).toContain('fill="#FFFFFF"');
    const style = attr(out, 'span', 'style');
    expect(style).toContain('width:40px');
    expect(style).toContain(`border-radius:${40 * TILE.radiusRatio}px`);
    expect(style).toContain('margin-bottom:14px'); // the caller's style is merged in
  });
});
