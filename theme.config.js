/** @type {const} */
const themeColors = {
  // Core 2026 palette - rich charcoal elevations, never pure black/white
  primary: { light: '#3B82F6', dark: '#3B82F6' },
  primaryMuted: { light: '#60A5FA', dark: '#60A5FA' },
  background: { light: '#0B0F17', dark: '#0B0F17' },
  surface: { light: '#161C28', dark: '#161C28' },
  surfaceElevated: { light: '#1C2436', dark: '#1C2436' },
  surfaceHighlight: { light: '#1E2A40', dark: '#1E2A40' },
  foreground: { light: '#F1F5F9', dark: '#F1F5F9' },
  foregroundMuted: { light: '#E2E8F0', dark: '#E2E8F0' },
  muted: { light: '#94A3B8', dark: '#94A3B8' },
  mutedSubtle: { light: '#64748B', dark: '#64748B' },
  border: { light: 'rgba(255,255,255,0.08)', dark: 'rgba(255,255,255,0.08)' },
  borderHighlight: { light: '#2A3447', dark: '#2A3447' },
  borderStrong: { light: 'rgba(255,255,255,0.12)', dark: 'rgba(255,255,255,0.12)' },
  success: { light: '#10B981', dark: '#10B981' },
  warning: { light: '#F59E0B', dark: '#F59E0B' },
  error: { light: '#EF4444', dark: '#EF4444' },
  // Semantic elevations for depth
  overlay: { light: 'rgba(11,15,23,0.8)', dark: 'rgba(11,15,23,0.8)' },
  scrim: { light: 'rgba(0,0,0,0.4)', dark: 'rgba(0,0,0,0.4)' },
};

module.exports = { themeColors };
