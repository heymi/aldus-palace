/**
 * Extra bindings for the demo worker (wrangler.demo.jsonc).
 *
 * Kept out of the generated worker-configuration.d.ts so `pnpm cf:types` can
 * regenerate that file without dropping these. Interface merging applies them
 * to every `Env` in the project.
 */
interface Env {
  /** Static assets binding (the reference client) — only set on the demo worker. */
  ASSETS?: Fetcher;
  /** "true" routes the demo worker into per-visitor isolation. */
  DEMO_MODE?: string;
}
