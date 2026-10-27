import { mountLolTft } from "./mount";

export { mountLolTft };
export type { MountOptions, MountedInstance } from "./mount";
export const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
