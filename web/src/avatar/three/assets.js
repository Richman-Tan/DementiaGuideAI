// Model asset URLs — referenced from the repo's tracked assets (not copied).
// Vite serves them from ../assets in dev (server.fs.allow) and copies them,
// content-hashed, into dist/assets on build.
export const MODEL_URLS = {
  aria: new URL('../../../../assets/characters/aria/model.glb', import.meta.url).href,
  zhenja: new URL('../../../../assets/characters/zhenja/zhenja.glb', import.meta.url).href,
};

export const BACKDROP_URL = new URL('../../../../assets/cozy_living_room_baked_small.glb', import.meta.url).href;

export const modelUrlFor = (modelKey) => MODEL_URLS[modelKey] ?? MODEL_URLS.aria;
