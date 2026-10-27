<template>
  <div class="detail-player" :class="{ 'detail-player--self': isSelf }">
    <span class="dp-champion">
      <GameIcon kind="champion" :id="player.championId" />
      <span class="dp-level" title="英雄等级">{{ player.level }}</span>
    </span>

    <span class="dp-spells">
      <GameIcon kind="summon-spell" :id="player.summonSpell1Id" />
      <GameIcon kind="summon-spell" :id="player.summonSpell2Id" />
    </span>

    <span class="dp-runes">
      <GameIcon v-if="player.perkStyleUrl" kind="url" id="keystone" :src="player.perkStyleUrl" />
      <GameIcon v-else kind="rune" :id="player.keystoneId" />
      <GameIcon kind="rune" :id="player.perkSubStyle" />
    </span>

    <span class="dp-summoner">
      <button type="button" class="dp-name" @click="$emit('openSummoner', player)">{{ decodedName }}</button>
      <span v-if="tierLabel" class="tag tag--tier" :title="tierLabel">{{ tierLabel }}</span>
      <span class="dp-tags">
        <span v-if="teamLabel" class="tag tag--team">{{ teamLabel }}</span>
        <span v-if="player.battleHonour?.isSvp" class="tag tag--svp">SVP</span>
        <span v-if="player.battleHonour?.isMvp" class="tag tag--mvp">MVP</span>
        <span v-if="player.wasAfk" class="tag tag--afk">逃跑</span>
        <span v-if="player.battleHonour?.isPentaKills" class="tag tag--penta">
          五杀<template v-if="(player.pentaKills || 0) > 1">×{{ player.pentaKills }}</template>
        </span>
      </span>
    </span>

    <template v-if="mode === '概要'">
      <span class="dp-bars">
        <Histogram
          :value="player.totalDamageToChampions"
          :max="maxValues.totalDamageToChampions"
          color="#1dbaa9"
          :text="formatThousands(player.totalDamageToChampions)"
          :highlight="isTop('totalDamageToChampions')"
        />
        <Histogram
          :value="player.totalDamageTaken"
          :max="maxValues.totalDamageTaken"
          color="#cccccc"
          :text="formatThousands(player.totalDamageTaken)"
          :highlight="isTop('totalDamageTaken')"
        />
      </span>
      <span v-if="mode === '概要'" class="dp-misc">
        <span class="dp-misc-line" title="补刀">补刀 {{ player.minionsKilled ?? "-" }}</span>
        <span class="dp-misc-line" title="经济">经济 {{ formatThousands(player.goldEarned) }}</span>
      </span>
      <span class="dp-kda">
        <span class="dp-kda-number">
          <span class="kill">{{ player.championsKilled }}</span>
          <span class="sep">/</span>
          <span class="death">{{ player.numDeaths }}</span>
          <span class="sep">/</span>
          <span class="assist">{{ player.assists }}</span>
        </span>
        <span class="dp-kda-ratio" :class="kdaClass">{{ kdaText }}</span>
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

    <template v-else>
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

type DamageKey =
  | "totalDamageToChampions"
  | "totalDamageTaken"
  | "magicDamageToChampions"
  | "physicalDamageToChampions"
  | "trueDemageToChampions";

const props = defineProps<{
  player: PlayerDetail;
  players: PlayerDetail[];
  mode: "概要" | "技能" | "伤害";
  isSelf?: boolean;
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
