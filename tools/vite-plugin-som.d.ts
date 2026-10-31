import type { Plugin } from 'vite';

export interface SomPluginOptions {
  /**
   * Include filter pattern (RegExp, glob or string).
   * @default /\.som$/
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
   * Enable Hot Module Replacement (HMR) for .som components while preserving component state.
   * @default true
   */
  hmr?: boolean;
}

/**
 * Official Vite plugin for Som.js.
 * Provides compilation of .som Single File Components, scoped CSS extraction,
 * route file transformation, and state-preserving Hot Module Replacement.
 *
 * @example
 * ```js
 * // vite.config.js
 * import { defineConfig } from 'vite';
 * import som from 'somjs/vite';
 *
 * export default defineConfig({
 *   plugins: [som()],
 * });
 * ```
 */
export function som(options?: SomPluginOptions): Plugin;
export function somPlugin(options?: SomPluginOptions): Plugin;
export default som;
