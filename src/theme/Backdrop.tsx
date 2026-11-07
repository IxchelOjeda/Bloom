/**
 * Theme background pattern (lace, grain, stars, scanlines…), drawn with SVG behind every
 * screen. Strength follows "decoration intensity"; the Minimal variation draws nothing.
 * Kept very faint so text contrast (enforced per theme) is never affected.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';
import { Theme } from './themes';

const OPACITY = [0, 0.05, 0.08, 0.12];

function tile(kind: NonNullable<Theme['pattern']>, c: string) {
  switch (kind) {
    case 'dots': return { size: 22, el: <Circle cx={11} cy={11} r={1.8} fill={c} /> };
    case 'grid': return { size: 24, el: <G stroke={c} strokeWidth={0.8}><Line x1={0} y1={0} x2={24} y2={0} /><Line x1={0} y1={0} x2={0} y2={24} /></G> };
    case 'stripes': return { size: 16, el: <Line x1={0} y1={16} x2={16} y2={0} stroke={c} strokeWidth={1.4} /> };
    case 'scanlines': return { size: 6, el: <Line x1={0} y1={0.5} x2={6} y2={0.5} stroke={c} strokeWidth={1} /> };
    case 'lace': return { size: 28, el: <G fill="none" stroke={c} strokeWidth={1}>
      <Circle cx={14} cy={14} r={9} /><Circle cx={14} cy={14} r={4} /><Circle cx={0} cy={0} r={5} /><Circle cx={28} cy={0} r={5} /><Circle cx={0} cy={28} r={5} /><Circle cx={28} cy={28} r={5} /></G> };
    case 'stars': return { size: 46, el: <G fill={c}>
      <Path d="M10 4 L11.2 8.8 L16 10 L11.2 11.2 L10 16 L8.8 11.2 L4 10 L8.8 8.8 Z" />
      <Path d="M33 27 L33.8 30.2 L37 31 L33.8 31.8 L33 35 L32.2 31.8 L29 31 L32.2 30.2 Z" /><Circle cx={36} cy={9} r={1} /><Circle cx={14} cy={36} r={1.2} /></G> };
    case 'flowers': return { size: 40, el: <G fill={c}>
      {[0, 72, 144, 216, 288].map((a) => <Circle key={a} cx={12 + 3.2 * Math.cos((a * Math.PI) / 180)} cy={12 + 3.2 * Math.sin((a * Math.PI) / 180)} r={2.4} />)}
      <Circle cx={30} cy={30} r={1.4} /></G> };
    case 'grain': {
      // deterministic speckle so it doesn't shimmer between renders
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      return { size: 64, el: <G fill={c}>{Array.from({ length: 34 }, (_, i) => <Circle key={i} cx={rnd() * 64} cy={rnd() * 64} r={0.5 + rnd() * 0.9} />)}</G> };
    }
  }
}

export function Backdrop({ theme }: { theme: Theme }) {
  if (!theme.pattern || theme.isMinimal || theme.decor <= 0) return null;
  const { size, el } = tile(theme.pattern, theme.colors.text);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" opacity={OPACITY[Math.min(3, theme.decor)]}>
        <Defs><Pattern id="bg" patternUnits="userSpaceOnUse" width={size} height={size}>{el}</Pattern></Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#bg)" />
      </Svg>
    </View>
  );
}
