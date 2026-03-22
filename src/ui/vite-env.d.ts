/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATIC_DEMO?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.jsonld?raw" {
  const content: string;
  export default content;
}
