import localFont from 'next/font/local';

/**
 * Inter variable font - used as the primary UI font
 * Downloaded from: https://github.com/rsms/inter
 */
export const inter = localFont({
  src: '../../public/fonts/Inter-Variable.woff2',
  variable: '--font-sans',
  display: 'swap',
  preload: true,
});

/**
 * Roboto variable font - used for transcript text
 * Downloaded from: https://fontsource.org/fonts/roboto
 * Supports weights 100-900
 */
export const roboto = localFont({
  src: '../../public/fonts/Roboto-Variable.woff2',
  variable: '--font-roboto',
  weight: '100 900',
  display: 'swap',
});

/**
 * Roboto Mono variable font - used for monospace text (timestamps, code)
 * Downloaded from: https://fontsource.org/fonts/roboto-mono
 * Supports weights 100-700
 */
export const robotoMono = localFont({
  src: '../../public/fonts/RobotoMono-Variable.woff2',
  variable: '--font-roboto-mono',
  weight: '100 700',
  display: 'swap',
});
