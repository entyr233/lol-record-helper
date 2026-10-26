import { mountLolTft } from "./mount";
import { installDevLoginMock } from "./dev/mock";

installDevLoginMock();

const host = document.getElementById("lol-tft-dev-root");
const mounted = mountLolTft({ host: host || undefined, shadow: true });

// 方便在控制台调试
(window as unknown as { __LOL_TFT__?: unknown }).__LOL_TFT__ = mounted;
