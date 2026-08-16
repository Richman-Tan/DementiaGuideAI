// Model asset URLs — referenced from the workspace-root assets/ (not copied).
// Vite serves them from ../../assets in dev (server.fs.allow) and copies them,
// content-hashed, into dist/assets on build.
//
// These are `import`s rather than `new URL(…, import.meta.url)` so they go through
// the '@assets' alias: an unresolvable path then fails the build, where a bad
// `new URL` would quietly produce a 404-ing runtime URL instead.
import ariaUrl from '@assets/characters/aria/model.glb';
import zhenjaUrl from '@assets/characters/zhenja/zhenja.glb';
import backdropUrl from '@assets/cozy_living_room_baked_small.glb';

export const MODEL_URLS = {
  aria: ariaUrl,
  zhenja: zhenjaUrl,
};

export const BACKDROP_URL = backdropUrl;

export const modelUrlFor = (modelKey) => MODEL_URLS[modelKey] ?? MODEL_URLS.aria;
