const staticExpoConfig = require('./app.json').expo;

module.exports = ({ config }) => ({
  ...config,
  ...staticExpoConfig,
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.12:4000/v1',
  },
});
