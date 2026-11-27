export interface MountedUi {
  unmount(): void;
}

export interface UiLibrary {
  mountLolTft(options: { host: HTMLElement }): MountedUi;
  mountHelperLogin?: () => unknown;
}

export interface PanelApi {
  version: string;
  open(): Promise<void>;
  close(): void;
}

export interface LoginCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  hostOnly: boolean;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  expirationDate?: number;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  partitionKey?: unknown;
  firstPartyDomain?: string;
}

interface ScriptCookieApi {
  list(filter: { url: string; name: string }): Promise<LoginCookie[]>;
  set(cookie: {
    url: string; name: string; value: string; domain?: string; path: string;
    httpOnly: boolean; secure: boolean; expirationDate: number; sameSite?: LoginCookie["sameSite"];
  }): Promise<unknown>;
}

declare global {
  const __VERSION__: string;
  const __REPO__: string;
  const __UI_RESOURCE__: string;
  const __UI_SHA256__: string;
  const LolTft: UiLibrary | undefined;
  const unsafeWindow: Window | undefined;
  function GM_getResourceText(name: string): string;
  function GM_registerMenuCommand(title: string, action: () => void): unknown;
  const GM: { registerMenuCommand?: typeof GM_registerMenuCommand; cookie?: ScriptCookieApi } | undefined;
  function GM_xmlhttpRequest(options: {
    method: string;
    url: string;
    timeout: number;
    onload(response: { status: number; responseText: string }): void;
    onerror(): void;
    ontimeout(): void;
  }): unknown;

  interface Window {
    LolTft?: UiLibrary;
    __LOL_TFT__?: PanelApi;
    TGP?: { status?: { aid?: number; uin?: string } };
  }
}
