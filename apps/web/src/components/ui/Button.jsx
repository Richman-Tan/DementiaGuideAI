// The app's button: one place for how a button looks, at rest, under the
// pointer, with keyboard focus and when it cannot be pressed.
//
//   <Button onClick={save}>Save</Button>
//   <Button variant="secondary" size="lg">Browse the library</Button>
//   <Button href={url} target="_blank">View original source</Button>
//   <Button icon variant="secondary" aria-label="Close preview">✕</Button>
//
// Its look is made of utility classes over the design tokens, so it follows the
// light, dark and high-contrast themes without knowing about them. Give it
// `className` for where it sits (a margin, its place in a row); how it looks is
// decided here.
import React from 'react';

// Every class below is written out whole. Tailwind makes a class only if it can
// read its name in the source, so one assembled from pieces would not exist.
const BASE = [
  'box-border inline-flex items-center justify-center gap-2',
  'border-solid no-underline cursor-pointer transition-colors',
  // Cannot be pressed: `disabled`, or `aria-disabled` for a control that has to
  // stay reachable by keyboard while it does nothing.
  'disabled:cursor-default disabled:opacity-50',
  'aria-disabled:cursor-default aria-disabled:opacity-50',
].join(' ');

// The hover styles are behind `not-disabled:not-aria-disabled:` so that a
// control which cannot be pressed does not light up under the pointer.
export const VARIANTS = {
  // The one thing the screen most wants done.
  primary: [
    'border-0 bg-primary text-on-primary',
    'not-disabled:not-aria-disabled:hover:bg-primary-dark',
  ].join(' '),
  // Anything else worth a button.
  secondary: [
    'border-(length:--bw) border-border bg-surface text-text',
    'not-disabled:not-aria-disabled:hover:bg-tint',
  ].join(' '),
};

// Both are at least the 44px a finger needs.
//
// The weight is set here and nowhere else. Two classes for one property do not
// resolve by their order in `className` but by their order in the stylesheet,
// so a "default" weight in BASE silently beat the large size's bold.
export const SIZES = {
  md: { shape: 'min-h-11 rounded-md font-semibold', text: 'px-5', icon: 'w-11 p-0' },
  lg: { shape: 'min-h-13 rounded-lg font-bold', text: 'px-6', icon: 'w-13 p-0' },
};

/**
 * @param {object} props
 * @param {'primary'|'secondary'} [props.variant]
 * @param {'md'|'lg'} [props.size]
 * @param {boolean} [props.icon]   Square, for a glyph with no text. It then needs an `aria-label`.
 * @param {string} [props.href]    With this it is a link that looks like a button.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon = false,
  className,
  href,
  ...rest
}) {
  const { shape, text, icon: square } = SIZES[size];
  const classes = [BASE, VARIANTS[variant], shape, icon ? square : text, className]
    .filter(Boolean)
    .join(' ');
  if (href !== undefined) {
    return <a href={href} className={classes} {...rest} />;
  }
  // `type` defaults to "button": left to the browser it is "submit", and a
  // button put inside a form later would start submitting it.
  return <button type="button" className={classes} {...rest} />;
}
