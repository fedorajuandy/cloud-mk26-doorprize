import base from './playwright.config.js';
export default {
  ...base,
  testMatch: 'proxy.check.js',
  webServer: [
    base.webServer[0],
    {
      ...base.webServer[1],
      env: { VITE_API_URL: '', VITE_SOCKET_URL: '', DEV_API_TARGET: 'http://localhost:6239' },
    },
  ],
};
