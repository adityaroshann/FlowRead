import path from 'node:path';
import { defineConfig } from 'wxt';

const CORE = path.resolve(__dirname, '../packages/core/src');

// Origins the extension talks to without asking per page. Everything else
// (arbitrary web pages) is reached through activeTab or optional permissions.
const API_HOSTS = ['https://flowread-backend.onrender.com/*', 'http://localhost:8000/*'];
const APP_HOSTS = ['http://localhost:5173/*', 'https://flowread-mu.vercel.app/*'];

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  modules: ['@wxt-dev/module-react'],
  alias: { '@flowread/core': CORE },
  vite: () => ({
    resolve: { alias: { '@flowread/core': CORE } },
    server: { fs: { allow: ['..'] } },
  }),
  manifest: ({ browser, mode }) => ({
    name: 'FlowRead',
    description: 'Read any web page in your FlowRead reading profile: fonts, spacing, colours and bold word starts.',
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus'],
    // The e2e build may script the local fixture server without a user gesture.
    host_permissions: [...API_HOSTS, ...APP_HOSTS, ...(mode === 'e2e' ? ['http://127.0.0.1/*'] : [])],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'FlowRead' },
    commands: {
      'toggle-flowread': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Turn FlowRead on or off for this tab',
      },
    },
    web_accessible_resources: [
      { resources: ['fonts/*.woff2'], matches: ['<all_urls>'] },
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'flowread-extension@flowread',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'], optional: ['websiteContent'] },
            },
          },
        }
      : {}),
  }),
});
