import { computed } from "vue";
import type { RqOptions, UserKey } from "../api/types";

export interface UserInfoSource {
  area: string | number;
  accountType?: string | number;
  id: string | number;
}

/** 把路由参数规整成接口需要的参数（account_type / area 必须是数字，id 必须是字符串） */
export function toRqOptions(source: UserInfoSource): RqOptions {
  return {
    account_type: Number(source.accountType ?? 2) || 2,
    area: Number(source.area) || 0,
    id: String(source.id),
    from_src: "lol_helper"
  };
}

export function useUserInfo(get: () => UserInfoSource) {
  const rqOptions = computed<RqOptions>(() => toRqOptions(get()));
  const userKey = computed<UserKey>(() => {
    const rq = rqOptions.value;
    return { area: rq.area, accountType: rq.account_type, id: rq.id };
  });
  return { rqOptions, userKey };
}
