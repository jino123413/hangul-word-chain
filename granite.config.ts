import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'hangul-word-chain',
  web: {
    host: '0.0.0.0',
    port: 8081,
    commands: {
      dev: 'rsbuild dev',
      build: 'rsbuild build',
    },
  },
  permissions: [],
  outdir: 'dist',
  brand: {
    displayName: '끝말잇기 챌린지',
    icon: 'https://raw.githubusercontent.com/jino123413/app-logos/master/hangul-word-chain.png',
    primaryColor: '#155E75',
    bridgeColorMode: 'basic',
  },
  webViewProps: {
    type: 'partner',
  },
});
