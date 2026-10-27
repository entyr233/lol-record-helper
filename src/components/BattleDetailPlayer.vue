<template>
  <div class="detail-player" :class="{ 'detail-player--self': isSelf, 'detail-player--tall': mode === '伤害' || mode === '海克斯', 'detail-player--mid': mode === '技能' }">
    <span class="dp-champion">
      <GameIcon kind="champion" :id="player.championId" />
      <span v-if="isTopDamage" class="dp-crown" title="全场输出最高">👑</span>
      <span class="dp-level" title="英雄等级">{{ player.level }}</span>
    </span>

    <span class="dp-spells">
      <span class="dp-mini-col">
        <GameIcon kind="summon-spell" :id="player.summonSpell1Id" />
        <GameIcon kind="summon-spell" :id="player.summonSpell2Id" />
      </span>
      <span v-if="!hexAram" class="dp-mini-col">
        <GameIcon v-if="player.perkStyleUrl" kind="url" id="keystone" :src="player.perkStyleUrl" />
        <GameIcon v-else kind="rune" :id="player.keystoneId" />
        <GameIcon kind="rune" :id="player.perkSubStyle" />
      </span>
      <span v-else class="dp-mini-col dp-mini-col--hex" title="海克斯强化">
        <template v-for="slot in augmentSlots.slice(0, 3)" :key="slot.id">
          <GameIcon v-if="slot.icon" kind="url" :id="String(slot.id)" :src="slot.icon" :title="slot.name" />
          <span v-else class="dp-augment-empty" :data-level="slot.level" />
        </template>
      </span>
    </span>

    <span class="dp-summoner">
      <button type="button" class="dp-name" @click="$emit('openSummoner', player)">{{ decodedName }}</button>
      <span class="dp-tags">
        <span v-if="player.battleHonour?.isSvp" class="tag tag--svp">SVP</span>
        <span v-if="player.battleHonour?.isMvp" class="tag tag--mvp">MVP</span>
        <span v-if="player.wasAfk" class="tag tag--afk">逃跑</span>
        <span v-if="player.battleHonour?.isPentaKills" class="tag tag--penta">
          五杀<template v-if="(player.pentaKills || 0) > 1">×{{ player.pentaKills }}</template>
        </span>
        <span v-if="tierLabel" class="tag tag--tier" :title="tierLabel">{{ tierLabel }}</span>
        <span v-if="teamLabel" class="tag tag--team">{{ teamLabel }}</span>
      </span>
    </span>

    <template v-if="mode === '概要'">
      <span class="dp-stat dp-stat--kda">
        <span class="stat-value">
          <b class="kill">{{ player.championsKilled }}</b><i>/</i><b class="death">{{ player.numDeaths }}</b><i>/</i><b class="assist">{{ player.assists }}</b>
        </span>
        <span class="stat-sub stat-sub--kda" :class="kdaClass">{{ kdaText }} · 参与{{ killParticipation }}%</span>
      </span>
      <span class="dp-stat">
        <span class="stat-value">{{ damageShare }}%</span>
        <span class="stat-sub">{{ formatThousands(player.totalDamageToChampions) }} 伤害</span>
      </span>
      <span class="dp-stat">
        <span class="stat-value">{{ player.minionsKilled ?? "-" }}</span>
        <span class="stat-sub">经济 {{ formatThousands(player.goldEarned) }}</span>
      </span>
      <span class="dp-items">
        <GameIcon v-for="itemId in itemSlots" :key="itemId" kind="item" :id="itemId" />
      </span>
    </template>

    <template v-else-if="mode === '技能'">
      <span class="dp-casts">
        <span class="cast">
          <GameIcon kind="summon-spell" :id="player.summonSpell1Id" />
          <span class="cast-count">{{ player.summonSpell1Cast ?? "-" }}</span>
        </span>
        <span class="cast">
          <GameIcon kind="summon-spell" :id="player.summonSpell2Id" />
          <span class="cast-count">{{ player.summonSpell2Cast ?? "-" }}</span>
        </span>
        <span class="cast">
          <GameIcon kind="champion-spell" id="passive" :champion-id="player.championId" />
          <span class="cast-key">被</span>
        </span>
        <span v-for="(spell, i) in activeSpells" :key="spell.key" class="cast">
          <GameIcon kind="champion-spell" :id="spell.key" :champion-id="player.championId" />
          <span class="cast-key">{{ spell.label }}</span>
          <span class="cast-count">{{ spell.count ?? "-" }}</span>
          <span class="cast-order">{{ i + 1 }}</span>
        </span>
      </span>
    </template>

    <template v-else-if="mode === '伤害'">
      <span class="dp-damage">
        <Histogram
          :value="player.totalDamageToChampions"
          :max="maxValues.totalDamageToChampions"
          color="#c85f13"
          :text="formatThousands(player.totalDamageToChampions)"
          :highlight="isTop('totalDamageToChampions')"
        />
        <Histogram
          :value="player.magicDamageToChampions"
          :max="maxValues.magicDamageToChampions"
          color="#7574c9"
          :text="formatThousands(player.magicDamageToChampions)"
          :highlight="isTop('magicDamageToChampions')"
        />
        <Histogram
          :value="player.physicalDamageToChampions"
          :max="maxValues.physicalDamageToChampions"
          color="#009cda"
          :text="formatThousands(player.physicalDamageToChampions)"
          :highlight="isTop('physicalDamageToChampions')"
        />
        <Histogram
          :value="player.trueDemageToChampions"
          :max="maxValues.trueDemageToChampions"
          color="#cccccc"
          :text="formatThousands(player.trueDemageToChampions)"
          :highlight="isTop('trueDemageToChampions')"
        />
      </span>
    </template>

    <template v-else>
      <span class="dp-hex">
        <template v-if="hexAram">
          <span v-if="augmentSlots.length === 0" class="dp-hex-empty">本场无强化记录</span>
          <span v-for="slot in augmentSlots" :key="slot.id" class="dp-hex-item" :data-level="slot.level">
            <GameIcon kind="url" :id="String(slot.id)" :src="slot.icon" :title="slot.name" />
            <span class="dp-hex-name" :data-level="slot.level">{{ slot.name }}</span>
          </span>
        </template>
        <span v-else class="dp-hex-empty">海克斯强化仅在海克斯大乱斗中存在</span>
      </span>
    </template>

    <span v-if="rankInfo" class="dp-rank">
      <span class="dp-rank-no">No.{{ rankInfo.rank }}</span>
      <span class="dp-rank-label">{{ rankInfo.label }}</span>
    </span>
    <span class="dp-score">{{ gameScore }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import GameIcon from "./GameIcon.vue";
import Histogram from "./Histogram.vue";
import type { PlayerDetail } from "../api/types";
import { getTeamMadeName } from "../const/queues";
import { tierName } from "../const/tiers";
import { formatGameScore, formatThousands, kdaRatio } from "../utils/format";
import augmentMap from "../data/kiwi-augments.json";

type DamageKey =
  | "totalDamageToChampions"
  | "totalDamageTaken"
  | "magicDamageToChampions"
  | "physicalDamageToChampions"
  | "trueDemageToChampions";

const props = defineProps<{
  player: PlayerDetail;
  players: PlayerDetail[];
  mode: "概要" | "技能" | "伤害" | "海克斯";
  isSelf?: boolean;
  /** 海克斯大乱斗（2400）：无符文，改显海克斯强化 */
  hexAram?: boolean;
  /** 排序模式的行内名次与对应数值 */
  rankInfo?: { rank: number; label: string } | null;
}>();

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

const DAMAGE_KEYS: DamageKey[] = [
  "totalDamageToChampions",
  "totalDamageTaken",
  "magicDamageToChampions",
  "physicalDamageToChampions",
  "trueDemageToChampions"
];

const maxValues = computed(() => {
  const result: Record<DamageKey, number> = {
    totalDamageToChampions: 0,
    totalDamageTaken: 0,
    magicDamageToChampions: 0,
    physicalDamageToChampions: 0,
    trueDemageToChampions: 0
  };
  for (const item of props.players) {
    for (const key of DAMAGE_KEYS) {
      const value = Number(item[key]);
      if (Number.isFinite(value) && value > result[key]) result[key] = value;
    }
  }
  return result;
});

const AUGMENTS = augmentMap as Record<string, { name: string; icon: string; level: string }>;
const augmentSlots = computed(() => {
  const slots: Array<{ id: number; name: string; icon: string; level: string }> = [];
  for (const key of ["playerAugment1", "playerAugment2", "playerAugment3", "playerAugment4", "playerAugment5", "playerAugment6"] as const) {
    const id = Number(props.player[key] ?? 0);
    if (!Number.isFinite(id) || id === 0) continue;
    const info = AUGMENTS[String(id)];
    slots.push({ id, name: info?.name ?? "", icon: info?.icon ?? "", level: info?.level ?? "" });
  }
  return slots;
});

const decodedName = computed(() => {
  try {
    return decodeURIComponent(props.player.name || "");
  } catch {
    return props.player.name || "";
  }
});

const teamLabel = computed(() => getTeamMadeName(props.player.teamMadeSize) ?? "");
const tierLabel = computed(() => {
  const gl = props.player.gameLevel;
  if (!gl || !gl.tier || tierName(gl.tier) === "未定级") return "";
  const lp = gl.leaguePoints ? " " + gl.leaguePoints + "LP" : "";
  return tierName(gl.tier) + lp;
});
const itemSlots = computed(() => [
  props.player.item0,
  props.player.item1,
  props.player.item2,
  props.player.item3,
  props.player.item4,
  props.player.item5,
  props.player.item6
]);

const kda = computed(() => kdaRatio(props.player.championsKilled, props.player.numDeaths, props.player.assists));
const kdaText = computed(() => kda.value.toFixed(2) + " : 1");
const kdaClass = computed(() => (kda.value >= 5 ? "well" : kda.value >= 3 ? "normal" : "bad"));
const gameScore = computed(() => formatGameScore(props.player.gameScore));

/** LeagueAkari 风格：参与击杀率与伤害团队占比（按同队 10 人内数据归一） */
const teamKills = computed(() =>
  props.players.filter((p) => p.teamId === props.player.teamId).reduce((sum, p) => sum + (p.championsKilled || 0), 0)
);
const killParticipation = computed(() => {
  const tk = teamKills.value;
  if (!tk) return 0;
  return Math.round(((props.player.championsKilled + props.player.assists) / tk) * 100);
});
const teamDamage = computed(() =>
  props.players.filter((p) => p.teamId === props.player.teamId).reduce((sum, p) => sum + (p.totalDamageToChampions || 0), 0)
);
const damageShare = computed(() => {
  const td = teamDamage.value;
  if (!td) return 0;
  return Math.round(((props.player.totalDamageToChampions || 0) / td) * 100);
});
const isTopDamage = computed(() => isTop("totalDamageToChampions"));

const activeSpells = computed(() => [
  { key: "q", label: "Q", count: props.player.spell1Cast },
  { key: "w", label: "W", count: props.player.spell2Cast },
  { key: "e", label: "E", count: props.player.spell3Cast },
  { key: "r", label: "R", count: props.player.spell4Cast }
]);

function isTop(key: DamageKey): boolean {
  return maxValues.value[key] > 0 && Number(props.player[key]) === maxValues.value[key];
}
</script>
