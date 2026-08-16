module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          // Relative alias values are resolved against `cwd`, which the plugin
          // defaults to `process.cwd()` — not to this file's directory. That was
          // harmless while babel.config.js sat at the repo root, but now the two
          // differ: invoked from the root, '@core' would resolve to
          // <above-the-repo>/packages/core and '@' to a repo-root src/ that no
          // longer exists. Pinning cwd makes the aliases invocation-independent.
          cwd: __dirname,
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
