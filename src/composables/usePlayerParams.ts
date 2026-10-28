import { computed } from "vue";
import type { PlayerQueryParams, PlayerKey } from "../api/types";

export interface PlayerParamsSource {
  area: string | number;
  accountType?: string | number;
  id: string | number;
}

/** 把路由参数规整成接口需要的参数（account_type / area 必须是数字，id 必须是字符串） */
export function toPlayerQueryParams(source: PlayerParamsSource): PlayerQueryParams {
  return {
    account_type: Number(source.accountType ?? 2) || 2,
    area: Number(source.area) || 0,
    id: String(source.id),
    from_src: "lol_helper"
  };
}

export function usePlayerParams(get: () => PlayerParamsSource) {
  const playerParams = computed<PlayerQueryParams>(() => toPlayerQueryParams(get()));
  const playerKey = computed<PlayerKey>(() => {
    const params = playerParams.value;
    return { area: params.area, accountType: params.account_type, id: params.id };
  });
  return { playerParams, playerKey };
}
