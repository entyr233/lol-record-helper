export function rankPayload(title = "S16 第三赛段") {
  return {
    code: 0,
    data: {
      season_rank_list: [{ season: 163, title, info: "", list: [
        { title: "单双排", full_rank_title: "钻石Ⅳ", tier: 1, rank: 3, league_points: 25, total: 30, wins_rate: 60 }
      ] }],
      trend: { tip: "最近排位记录", rank_trend: [{
        title: "单双排", axis: [{ tier: 1, rank: 3, title: "钻石Ⅳ" }, { tier: 1, rank: 2, title: "钻石Ⅲ" }],
        items: [
          { ts: 200, time: "10-28", tier: 1, rank: 2, points: 10 },
          { ts: 100, time: "10-27", tier: 1, rank: 3, points: 90 }
        ]
      }] }
    }
  };
}

export function rankHar() {
  const entry = (scene: string, time: string, title: string) => ({
    startedDateTime: time,
    request: { method: "POST", url: "https://mlol.qt.qq.com/go/battle_info/get_rank_trend", postData: { text: JSON.stringify({ scene }) } },
    response: { status: 200, content: { text: JSON.stringify(rankPayload(title)) } }
  });
  return { log: { entries: [
    entry("synthetic-self", "2026-10-28T00:00:00Z", "较早记录"),
    entry("synthetic-self", "2026-10-28T01:00:00Z", "S16 第三赛段"),
    entry("synthetic-other", "2026-10-28T01:00:00Z", "其他记录"),
    { request: { method: "POST", url: "https://mlol.qt.qq.com/go/user_profile/query/user?plat=ios" }, response: { status: 200, content: { text: JSON.stringify({ data: [{
      scene: "synthetic-profile", gameNickName: "默认档案名", gameInfoList: [
        { scene: "synthetic-self", roleName: "本人测试角色#0001", areaName: "测试大区" },
        { scene: "synthetic-other", roleName: "其他测试角色#0002", areaName: "其他大区" }
      ]
    }] }) } } }
  ] } };
}
