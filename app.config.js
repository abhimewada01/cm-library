const staticExpoConfig = require('./app.json').expo;

module.exports = ({ config }) => ({
  ...config,
  ...staticExpoConfig,
  plugins: [...(staticExpoConfig.plugins || []), 'expo-sharing', 'expo-notifications'],
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.12:4000/v1',
    eas: { ...config.extra?.eas, projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId },
  },
});
