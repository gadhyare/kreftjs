import type { Plugin } from 'vite';

export interface KreftPluginOptions {
  /**
   * Include filter pattern (RegExp, glob or string).
   * @default /\.kreft$/
   */
  include?: string | RegExp | (string | RegExp)[];

  /**
   * Exclude filter pattern (RegExp, glob or string).
   * @default /node_modules/
   */
  exclude?: string | RegExp | (string | RegExp)[];

  /**
   * Whether to precompile view expressions into functions ahead of time.
   * Enables CSP compliance without requiring 'unsafe-eval' for expressions.
   * @default true
   */
  precompile?: boolean;

  /**
   * Enable Hot Module Replacement (HMR) for .kreft components while preserving component state.
   * @default true
   */
  hmr?: boolean;
}

/**
 * Official Vite plugin for Kreft.
 * Provides compilation of .kreft Single File Components, scoped CSS extraction,
 * route file transformation, and state-preserving Hot Module Replacement.
 *
 * @example
 * ```js
 * // vite.config.js
 * import { defineConfig } from 'vite';
 * import kreft from 'kreft/vite';
 *
 * export default defineConfig({
 *   plugins: [kreft()],
 * });
 * ```
 */
export function kreft(options?: KreftPluginOptions): Plugin;
export function kreftPlugin(options?: KreftPluginOptions): Plugin;
/** @deprecated the Som.js name of `kreft` */
export function som(options?: KreftPluginOptions): Plugin;
export default kreft;
