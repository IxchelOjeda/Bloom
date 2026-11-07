/**
 * Theme engine — pure data + derivation, no React Native imports (unit-testable).
 * Each theme defines a compact "seed" for light and dark; buildTheme() derives the
 * full design-token set (buttons, cards, calendar, nav, progress…) and enforces
 * WCAG contrast so no aesthetic can make text unreadable.
 *
 * Character-inspired aesthetics use ORIGINAL names, colours and unicode ornaments
 * only — no character artwork, logos or trademarked names ship in the app.
 */

export type FontKind = 'sans' | 'serif' | 'rounded' | 'mono' | 'display';

export interface Seed {
  bg: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
}

export interface ThemeDef {
  id: string;
  name: string;
  blurb: string;
  font: FontKind;
  headingFont: FontKind;
  radius: number;          // card corner radius
  ornaments: string[];     // unicode-only decorative glyphs, scaled by decor intensity
  pattern?: 'dots' | 'grid' | 'lace' | 'stripes' | 'stars' | 'scanlines' | 'grain' | 'flowers';
  light: Seed;
  dark: Seed;
}

export const THEMES: ThemeDef[] = [
  { id: 'pinterest_minimalist', name: 'Pinterest Minimalist', blurb: 'Soft neutrals, airy layouts', font: 'sans', headingFont: 'serif', radius: 20, ornaments: ['✦'], pattern: undefined,
    light: { bg: '#F7F3EE', surface: '#FFFFFF', primary: '#B07C6E', secondary: '#D9C9BA', accent: '#8A9A7B', text: '#2E2A27' },
    dark:  { bg: '#1C1A18', surface: '#262321', primary: '#D4A598', secondary: '#4A423B', accent: '#A9B89A', text: '#F2ECE6' } },
  { id: 'coquette', name: 'Coquette', blurb: 'Bows, lace & blush pink', font: 'sans', headingFont: 'serif', radius: 24, ornaments: ['🎀', '♡', '˚'], pattern: 'lace',
    light: { bg: '#FFF4F6', surface: '#FFFFFF', primary: '#D6849A', secondary: '#F7D3DC', accent: '#C9A26B', text: '#4A2E35' },
    dark:  { bg: '#24171B', surface: '#311F25', primary: '#F0A6BA', secondary: '#5A3540', accent: '#E3C48E', text: '#FBEAEF' } },
  { id: 'grunge', name: 'Grunge', blurb: 'Distressed, muted, moody', font: 'mono', headingFont: 'display', radius: 6, ornaments: ['✕', '⁂'], pattern: 'grain',
    light: { bg: '#E4E2DC', surface: '#F2F1EC', primary: '#3E4A3D', secondary: '#B4B0A6', accent: '#7A6A4F', text: '#1D1F1B' },
    dark:  { bg: '#151614', surface: '#20221F', primary: '#7E9478', secondary: '#3A3C37', accent: '#A8936B', text: '#E2E1DB' } },
  { id: 'emo', name: 'Emo', blurb: 'Charcoal & deep red', font: 'sans', headingFont: 'display', radius: 10, ornaments: ['✖', '♱'], pattern: 'stripes',
    light: { bg: '#E9E6E6', surface: '#F7F5F5', primary: '#8E1B24', secondary: '#C9C2C2', accent: '#2B2B2B', text: '#151313' },
    dark:  { bg: '#0F0E0E', surface: '#1B1919', primary: '#D0343F', secondary: '#332E2E', accent: '#9A9393', text: '#EEE9E9' } },
  { id: 'gothic', name: 'Gothic', blurb: 'Burgundy, violet & silver', font: 'serif', headingFont: 'serif', radius: 12, ornaments: ['✠', '☽', '✧'], pattern: 'stars',
    light: { bg: '#EDE8EC', surface: '#FAF7F9', primary: '#6B1E3A', secondary: '#C7B9C5', accent: '#5A3F7A', text: '#1E141A' },
    dark:  { bg: '#120C10', surface: '#1E1419', primary: '#B04A6E', secondary: '#3A2733', accent: '#B9B3C2', text: '#EDE4EA' } },
  { id: 'dark_academia', name: 'Dark Academia', blurb: 'Parchment, oak & forest', font: 'serif', headingFont: 'serif', radius: 10, ornaments: ['❦', '✒'], pattern: 'grain',
    light: { bg: '#EFE6D6', surface: '#F8F1E4', primary: '#5B3A29', secondary: '#C9B79A', accent: '#2F4A3A', text: '#2A1E16' },
    dark:  { bg: '#1A1511', surface: '#251E18', primary: '#B88A62', secondary: '#43372B', accent: '#7FA08A', text: '#EDE2D0' } },
  { id: 'light_academia', name: 'Light Academia', blurb: 'Ivory, cream & old books', font: 'serif', headingFont: 'serif', radius: 14, ornaments: ['❧', '✎'], pattern: undefined,
    light: { bg: '#FBF7EF', surface: '#FFFDF8', primary: '#9C7A54', secondary: '#E8DCC6', accent: '#7D8A6A', text: '#3A2F24' },
    dark:  { bg: '#1E1B16', surface: '#29251E', primary: '#D2B48C', secondary: '#4A4234', accent: '#B4BF9E', text: '#F3ECDD' } },
  { id: 'clean_girl', name: 'Clean Girl', blurb: 'White, beige, effortless', font: 'sans', headingFont: 'sans', radius: 22, ornaments: [], pattern: undefined,
    light: { bg: '#FBFAF8', surface: '#FFFFFF', primary: '#A88B74', secondary: '#EEE7DF', accent: '#C7A98F', text: '#2B2622' },
    dark:  { bg: '#191817', surface: '#232120', primary: '#D1B49C', secondary: '#3E3934', accent: '#E0C7B1', text: '#F5F1EC' } },
  { id: 'old_money', name: 'Old Money', blurb: 'Navy, cream & gold', font: 'serif', headingFont: 'serif', radius: 8, ornaments: ['⚜'], pattern: 'stripes',
    light: { bg: '#F5F0E4', surface: '#FFFCF4', primary: '#1F2E4A', secondary: '#D8CFB8', accent: '#2E4B3A', text: '#1A1F2B' },
    dark:  { bg: '#0F1420', surface: '#18202F', primary: '#C9A85C', secondary: '#2C3549', accent: '#7E9C86', text: '#F1EAD8' } },
  { id: 'y2k', name: 'Y2K', blurb: 'Chrome, pink, 2000s gloss', font: 'rounded', headingFont: 'display', radius: 26, ornaments: ['✩', '☆', '⋆'], pattern: 'stars',
    light: { bg: '#EEF1F7', surface: '#FFFFFF', primary: '#E04FA5', secondary: '#C9D2E3', accent: '#5B8CFF', text: '#1D2030' },
    dark:  { bg: '#12131C', surface: '#1D1F2C', primary: '#FF7AC6', secondary: '#33384D', accent: '#8FB0FF', text: '#EEF0FA' } },
  { id: 'fairycore', name: 'Fairycore', blurb: 'Lilac, moss & butterflies', font: 'rounded', headingFont: 'serif', radius: 24, ornaments: ['🦋', '✿', '˚'], pattern: 'flowers',
    light: { bg: '#F4F2FA', surface: '#FFFFFF', primary: '#8C6BB8', secondary: '#D9E8D3', accent: '#6E9B6A', text: '#2F2A3A' },
    dark:  { bg: '#17151E', surface: '#221F2B', primary: '#C4A7EC', secondary: '#33402F', accent: '#9CC797', text: '#F0EDF7' } },
  { id: 'cottagecore', name: 'Cottagecore', blurb: 'Florals, linen & sage', font: 'serif', headingFont: 'serif', radius: 18, ornaments: ['✿', '❀', '🍓'], pattern: 'flowers',
    light: { bg: '#F7F1E6', surface: '#FFFBF3', primary: '#7E8F5E', secondary: '#EAD9C0', accent: '#C0705E', text: '#33301F' },
    dark:  { bg: '#1A1912', surface: '#25231A', primary: '#AFC08C', secondary: '#454030', accent: '#E59A87', text: '#F1EBDC' } },
  { id: 'cybercore', name: 'Cybercore', blurb: 'Neon on deep digital', font: 'mono', headingFont: 'mono', radius: 4, ornaments: ['◈', '⌁', '▸'], pattern: 'scanlines',
    light: { bg: '#E9F2F4', surface: '#F8FCFD', primary: '#007E8A', secondary: '#BFD6DB', accent: '#A100C2', text: '#0B1C22' },
    dark:  { bg: '#05070D', surface: '#0D1220', primary: '#00F0FF', secondary: '#1B2338', accent: '#FF2EE6', text: '#DDF6FF' } },
  { id: 'kawaii', name: 'Kawaii', blurb: 'Candy pastels, playful', font: 'rounded', headingFont: 'rounded', radius: 28, ornaments: ['♡', '☁', '✧'], pattern: 'dots',
    light: { bg: '#FFF7FB', surface: '#FFFFFF', primary: '#F08BB3', secondary: '#C8E7F5', accent: '#9ED8B5', text: '#3A2C36' },
    dark:  { bg: '#1E1720', surface: '#2A2030', primary: '#FFA9CB', secondary: '#2E4552', accent: '#A7E3C1', text: '#FBEFF6' } },
  { id: 'mischief_goth_cute', name: 'Midnight Mischief', blurb: 'Goth-cute: black, purple & pink', font: 'rounded', headingFont: 'display', radius: 22, ornaments: ['☠', '♡', '✦'], pattern: 'dots',
    light: { bg: '#F3EEF7', surface: '#FFFFFF', primary: '#6B3FA0', secondary: '#E8C9DD', accent: '#D14F8C', text: '#1F1726' },
    dark:  { bg: '#121016', surface: '#1E1A24', primary: '#B48CF0', secondary: '#3B2C47', accent: '#FF8DC0', text: '#F2ECF8' } },
  { id: 'sweet_melody', name: 'Sweet Melody', blurb: 'Soft pink & cream pastel', font: 'rounded', headingFont: 'rounded', radius: 28, ornaments: ['♪', '♡', '✿'], pattern: 'dots',
    light: { bg: '#FFF6F4', surface: '#FFFFFF', primary: '#E58FA3', secondary: '#FBE3D9', accent: '#E8C27A', text: '#4A2F33' },
    dark:  { bg: '#211819', surface: '#2D2123', primary: '#FFB0C1', secondary: '#4D3532', accent: '#F2D49A', text: '#FFF0EE' } },
  { id: 'cherry_bow', name: 'Cherry Bow', blurb: 'Pink, white & cherry red', font: 'rounded', headingFont: 'rounded', radius: 26, ornaments: ['🎀', '🍒', '✧'], pattern: 'dots',
    light: { bg: '#FFF7F9', surface: '#FFFFFF', primary: '#D7263D', secondary: '#FFD6E0', accent: '#F28AA8', text: '#2E1A1E' },
    dark:  { bg: '#1C1214', surface: '#2A1B1E', primary: '#FF5A6E', secondary: '#4A2A32', accent: '#FFA3BD', text: '#FFF0F3' } },
  { id: 'balletcore', name: 'Balletcore', blurb: 'Satin, ribbons, pale pink', font: 'sans', headingFont: 'serif', radius: 30, ornaments: ['🩰', '🎀', '˚'], pattern: 'lace',
    light: { bg: '#FCF4F2', surface: '#FFFFFF', primary: '#C98B95', secondary: '#F3DEDB', accent: '#B7A3B8', text: '#3E2C2F' },
    dark:  { bg: '#1E1718', surface: '#2A2122', primary: '#E8B3BB', secondary: '#4A3A3B', accent: '#D4C3D5', text: '#FBEFEE' } },
  { id: 'retro_70s', name: 'Retro 70s', blurb: 'Burnt orange, mustard, brown', font: 'rounded', headingFont: 'display', radius: 18, ornaments: ['☮', '✺', '❂'], pattern: 'stripes',
    light: { bg: '#F6EBD6', surface: '#FFF6E6', primary: '#C2571A', secondary: '#E5B94E', accent: '#6B4226', text: '#2E1F12' },
    dark:  { bg: '#1D150D', surface: '#2A1F14', primary: '#F08A4B', secondary: '#5A4320', accent: '#E8C26A', text: '#F7E9D2' } },
  { id: 'cyber_y2k_pink', name: 'Cyber Y2K Pink', blurb: 'Hot pink, silver, glossy', font: 'rounded', headingFont: 'mono', radius: 20, ornaments: ['✦', '⟡', '☆'], pattern: 'grid',
    light: { bg: '#F4F0F6', surface: '#FFFFFF', primary: '#E0137D', secondary: '#D5D3DE', accent: '#7A7F99', text: '#1B1420' },
    dark:  { bg: '#0F0A12', surface: '#1C1422', primary: '#FF3EA5', secondary: '#38303F', accent: '#C9CCDA', text: '#F7EEF5' } },
];

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
export function luminance(hex: string): number {
  const c = hexToRgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [L1, L2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}
/** Nudges `fg` toward black or white until it reaches `min` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}
/** Best readable text colour to sit on a filled colour (e.g. a button). */
export function onColor(bg: string): string {
  return contrast('#FFFFFF', bg) >= contrast('#111111', bg) ? '#FFFFFF' : '#111111';
}

// ---------------------------------------------------------------------------
// Full token set
// ---------------------------------------------------------------------------
export interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  isMinimal: boolean;
  decor: number; // 0..3
  colors: {
    bg: string; surface: string; surfaceAlt: string;
    primary: string; onPrimary: string; primarySoft: string;
    secondary: string; onSecondary: string;
    accent: string; onAccent: string;
    text: string; textMuted: string; border: string;
    success: string; warning: string; danger: string; info: string;
    progressTrack: string; progressFill: string;
    navBg: string; navActive: string; navInactive: string;
    calToday: string; calTodayText: string; calEvent: string; calRest: string; calWeekend: string;
    overlay: string;
  };
  font: { body: FontKind; heading: FontKind };
  radius: { sm: number; md: number; lg: number; pill: number };
  spacing: (n: number) => number;
  ornaments: string[];
  pattern?: ThemeDef['pattern'];
}

export interface ThemeOptions {
  mode: 'light' | 'dark';
  decor?: number;                       // 0 = minimal variation
  custom?: Partial<Seed>;               // user colour overrides
}

export function getThemeDef(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function buildTheme(id: string, opts: ThemeOptions): Theme {
  const def = getThemeDef(id);
  const seed: Seed = { ...def[opts.mode], ...(opts.custom ?? {}) };
  const decor = Math.max(0, Math.min(3, opts.decor ?? 2));
  const dark = opts.mode === 'dark';

  const text = ensureContrast(seed.text, seed.bg, 7);
  const textOnSurface = ensureContrast(text, seed.surface, 7);
  const muted = ensureContrast(mix(textOnSurface, seed.surface, 0.38), seed.surface, 4.5);
  // Primary is used for text links/icons on surfaces too → must be legible there.
  const primary = ensureContrast(seed.primary, seed.surface, 3);
  const accent = ensureContrast(seed.accent, seed.surface, 3);

  const status = dark
    ? { success: '#7FC8A0', warning: '#E9C46A', danger: '#F08A8A', info: '#8FB8E8' }
    : { success: '#3E8E63', warning: '#A9741A', danger: '#C0453F', info: '#3A6EA5' };
  for (const k of Object.keys(status) as (keyof typeof status)[]) status[k] = ensureContrast(status[k], seed.surface, 3);

  return {
    id: def.id,
    name: def.name,
    mode: opts.mode,
    isMinimal: decor === 0,
    decor,
    colors: {
      bg: seed.bg,
      surface: seed.surface,
      surfaceAlt: mix(seed.surface, seed.secondary, dark ? 0.35 : 0.25),
      primary, onPrimary: onColor(primary),
      primarySoft: mix(seed.surface, primary, dark ? 0.22 : 0.14),
      secondary: seed.secondary, onSecondary: onColor(seed.secondary),
      accent, onAccent: onColor(accent),
      text: textOnSurface, textMuted: muted,
      border: mix(seed.surface, textOnSurface, dark ? 0.16 : 0.1),
      ...status,
      progressTrack: mix(seed.surface, seed.secondary, 0.6),
      progressFill: primary,
      navBg: seed.surface,
      navActive: primary,
      navInactive: muted,
      calToday: primary, calTodayText: onColor(primary),
      calEvent: mix(seed.surface, accent, 0.25),
      calRest: mix(seed.surface, status.success, 0.15),
      calWeekend: mix(seed.bg, seed.secondary, 0.2),
      overlay: dark ? 'rgba(0,0,0,0.6)' : 'rgba(20,16,14,0.35)',
    },
    font: decor === 0 ? { body: 'sans', heading: 'sans' } : { body: def.font, heading: def.headingFont },
    radius: { sm: Math.round(def.radius / 2), md: def.radius, lg: def.radius + 8, pill: 999 },
    spacing: (n: number) => n * 4,
    ornaments: decor === 0 ? [] : def.ornaments.slice(0, decor),
    pattern: decor >= 2 ? def.pattern : undefined,
  };
}
