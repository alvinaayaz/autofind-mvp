declare module "cloudflare:workers" {
  import type { BrowserWorker } from "@cloudflare/playwright";

  export const env: {
    BROWSER: BrowserWorker;
  };
}
