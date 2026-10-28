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

declare global {
  const __VERSION__: string;
  const __REPO__: string;
  const __UI_RESOURCE__: string;
  const __UI_SHA256__: string;
  const LolTft: UiLibrary | undefined;
  const unsafeWindow: Window | undefined;
  function GM_getResourceText(name: string): string;
  function GM_registerMenuCommand(title: string, action: () => void): unknown;
  const GM: { registerMenuCommand?: typeof GM_registerMenuCommand } | undefined;
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
