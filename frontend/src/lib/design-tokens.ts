/**
 * Design Tokens - Centralized design system values
 * Use these constants throughout the app for consistency
 */

// Spacing scale (Tailwind-compatible)
export const spacing = {
  xs: '0.5rem', // 8px
  sm: '0.75rem', // 12px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '3rem', // 48px
  '3xl': '4rem', // 64px
  '4xl': '6rem', // 96px
} as const;

// Animation durations
export const duration = {
  instant: '100ms',
  fast: '200ms',
  normal: '300ms',
  slow: '500ms',
  slower: '700ms',
} as const;

// Animation timing functions
export const easing = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const;

// Transition presets
export const transitions = {
  // Component transitions
  fade: `opacity ${duration.normal} ${easing.smooth}`,
  scale: `transform ${duration.normal} ${easing.smooth}`,
  slide: `transform ${duration.normal} ${easing.smooth}`,
  all: `all ${duration.normal} ${easing.smooth}`,

  // Interactive states
  button: `all ${duration.fast} ${easing.smooth}`,
  card: `all ${duration.normal} ${easing.smooth}`,
  modal: `all ${duration.normal} ${easing.smooth}`,

  // Focus states
  focus: `box-shadow ${duration.fast} ${easing.smooth}, border-color ${duration.fast} ${easing.smooth}`,
} as const;

// Focus ring styles (accessibility)
export const focusRing = {
  default:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-500 focus-visible:ring-offset-2',
  dark: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900',
  coral:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2',
  none: 'focus-visible:outline-none',
} as const;

// Border radius
export const radius = {
  none: '0',
  sm: '0.375rem', // 6px
  md: '0.5rem', // 8px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px
  '2xl': '1.5rem', // 24px
  '3xl': '1.75rem', // 28px
  full: '9999px',
} as const;

// Shadow levels
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  glow: '0 0 15px rgba(0, 158, 224, 0.3)',
  glowCoral: '0 0 15px rgba(255, 107, 74, 0.3)',
} as const;

// Z-index layers
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
} as const;

// Container max widths
export const containers = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '7xl': '80rem', // 1280px
} as const;

// Breakpoints (for JS media queries)
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// Utility function to create transition classes
export const createTransition = (
  properties: string[],
  transitionDuration: keyof typeof duration = 'normal'
) => {
  return properties
    .map((prop) => `${prop} ${transitionDuration} ${easing.smooth}`)
    .join(', ');
};

// Utility function to combine focus ring with other classes
export const withFocusRing = (
  baseClasses: string,
  variant: keyof typeof focusRing = 'default'
) => {
  return `${baseClasses} ${focusRing[variant]}`;
};
