module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // "@/..." path aliases come from tsconfig "paths" (supported natively by Expo SDK 50+).
    plugins: ['react-native-reanimated/plugin'],
  };
};
