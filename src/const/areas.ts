export interface AreaOption {
  label: string;
  value: number;
}

/** 国服大区（与旧版 areas.js 一致，后续可改为接口下发） */
export const areas: AreaOption[] = [
  { label: "艾欧尼亚  电信", value: 1 },
  { label: "比尔吉沃特  网通", value: 2 },
  { label: "祖安 电信", value: 3 },
  { label: "诺克萨斯  电信", value: 4 },
  { label: "班德尔城 电信", value: 5 },
  { label: "德玛西亚 网通", value: 6 },
  { label: "皮尔特沃夫 电信", value: 7 },
  { label: "战争学院 电信", value: 8 },
  { label: "弗雷尔卓德 网通", value: 9 },
  { label: "巨神峰 电信", value: 10 },
  { label: "雷瑟守备 电信", value: 11 },
  { label: "无畏先锋 网通", value: 12 },
  { label: "裁决之地 电信", value: 13 },
  { label: "黑色玫瑰 电信", value: 14 },
  { label: "暗影岛 电信", value: 15 },
  { label: "恕瑞玛 网通", value: 16 },
  { label: "钢铁烈阳 电信", value: 17 },
  { label: "水晶之痕 电信", value: 18 },
  { label: "均衡教派", value: 19 },
  { label: "扭曲丛林 网通", value: 20 },
  { label: "教育网专区", value: 21 },
  { label: "影流 电信", value: 22 },
  { label: "守望之海 电信", value: 23 },
  { label: "征服之海 电信", value: 24 },
  { label: "卡拉曼达 电信", value: 25 },
  { label: "巨龙之巢 网通", value: 26 },
  { label: "皮城警备 电信", value: 27 },
  { label: "男爵领域 全网络", value: 30 }
];

const areaNameMap = new Map(areas.map((item) => [item.value, item.label]));

export function getAreaName(id: number | string): string {
  const numeric = Number(id);
  const name = areaNameMap.get(numeric);
  return name || "未知-" + id;
}
