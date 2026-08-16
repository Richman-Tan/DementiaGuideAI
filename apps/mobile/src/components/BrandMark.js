// The DementiaGuide AI "Companion" mark — two overlapping circles, one solid
// and one outlined. Geometry comes from @core/brand/mark.js, shared with the web
// component and the icon generator.
//
// Drawn with two plain Views rather than SVG: react-native-svg is not a
// dependency of this app and this mark does not need it. Avatar.js builds its
// ring the same way. The one conversion to get right is that React Native draws
// borderWidth *inside* the view bounds while an SVG stroke straddles its radius,
// so the ring View is sized to the stroke's outer diameter — derived below
// rather than eyeballed, so it cannot drift from the SVG the icons come from.
import React from 'react';
import { View, PixelRatio } from 'react-native';
import { markFor, markBounds } from '@core/brand/mark';
import { Colors } from '../theme/colors';

const snap = (v) => PixelRatio.roundToNearestPixel(v);

export const BrandMark = ({ size = 32, color, ringColor, style }) => {
  // `size` is the drawn width of the mark, which is wider than it is tall
  // (~1.43:1) — the mark is not square and is not padded to look square.
  const mark = markFor(size, false);
  const bounds = markBounds(mark);
  const scale = size / bounds.width;
  const at = (v) => v * scale;

  const { solid, ring } = mark;
  const ringOuter = ring.r + ring.strokeWidth / 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="DementiaGuide AI"
      style={[{ width: size, height: snap(at(bounds.height)) }, style]}
    >
      <View
        style={{
          position: 'absolute',
          left: snap(at(solid.cx - solid.r - bounds.minX)),
          top: snap(at(solid.cy - solid.r - bounds.minY)),
          width: snap(at(solid.r * 2)),
          height: snap(at(solid.r * 2)),
          borderRadius: at(solid.r),
          backgroundColor: color || Colors.primary,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: snap(at(ring.cx - ringOuter - bounds.minX)),
          top: snap(at(ring.cy - ringOuter - bounds.minY)),
          width: snap(at(ringOuter * 2)),
          height: snap(at(ringOuter * 2)),
          borderRadius: at(ringOuter),
          // Never let the ring round away to nothing on a small, dense screen.
          borderWidth: Math.max(1 / PixelRatio.get(), snap(at(ring.strokeWidth))),
          borderColor: ringColor || Colors.primaryLight,
        }}
      />
    </View>
  );
};
