export interface WeGameLoginUser {
  tgp_id?: string;
  faceurl?: string;
  nick?: string;
  channel?: string;
  uin?: number;
}

export interface WeGameLoginSdk {
  isLogin(): boolean;
  logout(): void;
  getUserInfo(): WeGameLoginUser;
  getLoginUser(): Promise<{ uin: number } & Record<string, unknown>>;
  popup?: () => void;
  onLogin?: (cb: () => void) => void;
  readyPromise?: Promise<void>;
}

declare global {
  interface Window {
    WegameLogin?: { default?: WeGameLoginSdk };
  }
}

export {};
