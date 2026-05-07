/**
 * Optional defaults used to seed the ServerPickerScreen on first launch.
 * The actual runtime configuration lives in localStorage (see config/serverConfig.ts).
 *
 * Setting these via .env.local is purely a convenience for local dev — the
 * deployed bundle does NOT need them and will work against any OpenEMR.
 */
type RawEnv = {
  VITE_DEFAULT_SERVER_URL?: string;
};

function readEnv(): RawEnv {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env as unknown as RawEnv;
  }
  return {};
}

export const env = {
  defaultServerUrl: (): string =>
    readEnv().VITE_DEFAULT_SERVER_URL ?? 'https://localhost:9300',
};
