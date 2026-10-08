import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, type Plugin } from 'vite';
import { TRIAL_EMPLOYEE_RANGE_LABELS, TRIAL_EMPLOYEE_RANGES, TRIAL_IDENTITY_PROVIDER_LABELS, TRIAL_IDENTITY_PROVIDERS } from '../../packages/domain/src/trial.js';

const root = import.meta.dirname;
const partials = resolve(root, 'src/partials');

/** A local API's address: the PORT in that app's .env when it sets one (some machines run it elsewhere), else the default. */
function localApi(app: string, port: number) {
  const env = resolve(root, `../${app}/.env`);
  return `http://localhost:${(existsSync(env) && parseEnv(readFileSync(env, 'utf8')).PORT) || port}`;
}

/** Partials made from the shared trial rules, so the form's choices are in the HTML and match what the API accepts. */
const generated: Record<string, () => string> = {
  'employee-options': () => TRIAL_EMPLOYEE_RANGES.map(r => `<option value="${r}">${TRIAL_EMPLOYEE_RANGE_LABELS[r]}</option>`).join(''),
  'identity-options': () => TRIAL_IDENTITY_PROVIDERS.map(p =>
    `<label class="choice"><input type="radio" name="identityProvider" value="${p}" aria-describedby="err-identityProvider">${TRIAL_IDENTITY_PROVIDER_LABELS[p]}</label>`).join(''),
};

/**
 * Shared header, footer and head tags, pasted into every page at build time (`<!-- include:nav -->` reads
 * src/partials/nav.html, or logo.svg), so each page is complete HTML without JavaScript.
 */
function includePartials(): Plugin {
  const expand = (html: string, depth = 0): string =>
    html.replace(/<!--\s*include:([a-z-]+)\s*-->/g, (_, name: string) => {
      if (depth > 4) throw new Error(`Partials nest too deep at ${name}`);
      const make = generated[name];
      if (make) return make();
      const file = ['html', 'svg'].map(ext => resolve(partials, `${name}.${ext}`)).find(existsSync);
      if (!file) throw new Error(`No partial named ${name}`);
      return expand(readFileSync(file, 'utf8').trim(), depth + 1);
    });
  return {
    name: 'yutis-site-partials',
    transformIndexHtml: { order: 'pre', handler: html => expand(html) },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(partials)) server.ws.send({ type: 'full-reload' });
    },
  };
}

const pages = ['index.html', 'trial/index.html', 'login/index.html', 'pay/index.html', 'privacy/index.html', 'terms/index.html', '404.html'];

export default defineConfig({
  plugins: [includePartials()],
  // Use the domain package's source directly, so dev, tests and typecheck never need its dist build. Only its trial rules:
  // the package index has module-level code (NMQ tables and such) that would otherwise ride along in the site's bundle.
  resolve: { alias: { '@yutis/domain': resolve(root, '../../packages/domain/src/trial.ts') } },
  build: {
    rollupOptions: { input: Object.fromEntries(pages.map(p => [p.replace(/(\/index)?\.html$/, '') || 'home', resolve(root, p)])) },
    assetsInlineLimit: 0,
    // Every browser the site supports has modulepreload; skip the polyfill script.
    modulePreload: { polyfill: false },
  },
  // The trial form and the payment page call the platform API, which the same host serves under /platform-api in production.
  server: { port: 5184, proxy: { '/platform-api': { target: localApi('platform-api', 3001) } } },
  preview: { port: 5184 },
});
