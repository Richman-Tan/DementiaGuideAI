module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            // Platform-agnostic logic shared with apps/web and the Node scripts.
            '@core': '../../packages/core',
            // Shared 3D models, at the workspace root because both apps load them.
            // Aliased rather than reached with ../../../../../.. from deep screens.
            '@assets': '../../assets',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
  };
};
