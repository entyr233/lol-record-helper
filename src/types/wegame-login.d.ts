export interface WeGameLoginUser {
  tgp_id?: string;
  faceurl?: string;
  nick?: string;
  channel?: string;
  uin?: string | number;
}

export interface WeGameLoginSdk {
  isLogin(): boolean;
  logout(): void;
  getUserInfo(): WeGameLoginUser;
  getLoginUser(): Promise<{ uin?: string | number } & Record<string, unknown>>;
  popup?: () => void | Promise<unknown>;
  onLogin?: (cb: () => void) => void;
  readyPromise?: Promise<void>;
}

declare global {
  interface Window {
    WegameLogin?: { default?: WeGameLoginSdk };
  }
}

export {};
