<template>
  <div class="detail-player" :class="{ 'detail-player--self': isSelf, 'detail-player--tall': mode === '伤害', 'detail-player--mid': mode === '技能' }">
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
        <span v-if="runeMissing" class="dp-missing" :title="MISSING_TITLE">符文未提供</span>
        <template v-else>
          <GameIcon v-if="player.perkStyleUrl" kind="url" id="keystone" :src="player.perkStyleUrl" />
          <GameIcon v-else kind="rune" :id="player.keystoneId ?? 0" />
          <GameIcon kind="rune" :id="player.perkSubStyle ?? 0" />
        </template>
      </span>
      <span v-else class="dp-mini-col dp-mini-col--hex" title="海克斯强化">
        <template v-for="slot in augmentSlots.slice(0, 3)" :key="slot.id">
          <GameIcon v-if="slot.icon" kind="url" :id="String(slot.id)" :src="slot.icon" :title="slot.title" />
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
      <!-- 排序名次内联在昵称下方：不再单独占一列，避免窄窗口横向溢出 -->
      <span v-if="rankInfo" class="dp-rank-inline">No.{{ rankInfo.rank }} · {{ rankInfo.label }}</span>
    </span>

    <template v-if="mode === '概要'">
      <span class="dp-stat dp-stat--kda" title="击杀/死亡/助攻">
        <span class="stat-value">
          <b class="kill">{{ player.championsKilled }}</b><i>/</i><b class="death">{{ player.numDeaths }}</b><i>/</i><b class="assist">{{ player.assists }}</b>
        </span>
        <span class="stat-sub stat-sub--kda" :class="kdaClass">{{ kdaText }} · 参与{{ killParticipation }}%</span>
      </span>
      <span class="dp-stat" title="伤害占团队比例">
        <template v-if="hasValue(player.totalDamageToChampions)">
          <span class="stat-value">{{ damageShare }}%</span>
          <span class="stat-sub">{{ formatThousands(player.totalDamageToChampions) }} 伤害</span>
        </template>
        <span v-else class="stat-value dp-missing" :title="MISSING_TITLE">未提供</span>
      </span>
      <span class="dp-stat" title="补刀/经济">
        <span v-if="economyMissing" class="stat-value dp-missing" :title="MISSING_TITLE">未提供</span>
        <template v-else>
          <span
            class="stat-value"
            :class="{ 'dp-missing': !hasValue(player.minionsKilled) }"
            :title="hasValue(player.minionsKilled) ? undefined : MISSING_TITLE"
          >{{ hasValue(player.minionsKilled) ? player.minionsKilled : "未提供" }}</span>
          <span
            class="stat-sub"
            :class="{ 'dp-missing': !hasValue(player.goldEarned) }"
            :title="hasValue(player.goldEarned) ? undefined : MISSING_TITLE"
          >{{ hasValue(player.goldEarned) ? "经济 " + formatThousands(player.goldEarned) : "经济 未提供" }}</span>
        </template>
      </span>
      <span class="dp-items">
        <span v-if="itemsMissing" class="dp-missing" :title="MISSING_TITLE">装备未提供</span>
        <template v-else>
          <GameIcon v-for="(itemId, slotIndex) in itemSlots" :key="slotIndex" kind="item" :id="itemId ?? 0" />
        </template>
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
          :value="damageValue('totalDamageToChampions')"
          :max="maxValues.totalDamageToChampions"
          color="#c85f13"
          :text="damageText('totalDamageToChampions')"
          :highlight="isTop('totalDamageToChampions')"
          :title="damageTitle('totalDamageToChampions', '对英雄总伤害')"
        />
        <Histogram
          :value="damageValue('magicDamageToChampions')"
          :max="maxValues.magicDamageToChampions"
          color="#7574c9"
          :text="damageText('magicDamageToChampions')"
          :highlight="isTop('magicDamageToChampions')"
          :title="damageTitle('magicDamageToChampions', '魔法伤害')"
        />
        <Histogram
          :value="damageValue('physicalDamageToChampions')"
          :max="maxValues.physicalDamageToChampions"
          color="#009cda"
          :text="damageText('physicalDamageToChampions')"
          :highlight="isTop('physicalDamageToChampions')"
          :title="damageTitle('physicalDamageToChampions', '物理伤害')"
        />
        <Histogram
          :value="damageValue('trueDemageToChampions')"
          :max="maxValues.trueDemageToChampions"
          color="#cccccc"
          :text="damageText('trueDemageToChampions')"
          :highlight="isTop('trueDemageToChampions')"
          :title="damageTitle('trueDemageToChampions', '真实伤害')"
        />
      </span>
    </template>

    <span class="dp-score">{{ gameScore }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import GameIcon from "./GameIcon.vue";
import Histogram from "./Histogram.vue";
import type { PlayerDetail } from "../api/types";
import { getTeamMadeLabel } from "../const/queues";
import { tierName } from "../const/tiers";
import { formatGameScore, formatThousands, kdaRatio } from "../utils/format";
import augmentMap from "../data/kiwi-augments.json";
import { runeIconUrl } from "../api/staticData";
import { summarizePlayers, type DamageKey, type PlayerStatistics } from "../utils/battlePlayers";
import { useAramgg } from "../composables/useAramgg";

const props = defineProps<{
  player: PlayerDetail;
  players: PlayerDetail[];
  statistics?: PlayerStatistics;
  mode: "概要" | "技能" | "伤害";
  isSelf?: boolean;
  /** 是否排位类队列：排位用单排/双排，其他模式用单人/双人开黑 */
  ranked?: boolean;
  /** 海克斯大乱斗（2400）：无符文，改显海克斯强化 */
  hexAram?: boolean;
  /** 排序模式的行内名次与对应数值 */
  rankInfo?: { rank: number; label: string } | null;
  /** 来源字段不完整（掌盟公开源等）：缺失字段显示「未提供」，不冒充 0 */
  partial?: boolean;
}>();

defineEmits<{ openSummoner: [player: PlayerDetail] }>();

/** 缺失字段的统一悬浮说明 */
const MISSING_TITLE = "掌盟源未提供该字段";

/** 字段是否有真实值：undefined/null 视为未提供，0 是有效值 */
function hasValue(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function damageValue(key: DamageKey): number {
  return hasValue(props.player[key]) ? Number(props.player[key]) : 0;
}
function damageText(key: DamageKey): string {
  return hasValue(props.player[key]) ? formatThousands(props.player[key]) : "";
}
function damageTitle(key: DamageKey, label: string): string {
  return hasValue(props.player[key]) ? label : "未提供";
}

const statistics = computed(() => props.statistics ?? summarizePlayers(props.players));
const maxValues = computed(() => statistics.value.maxDamage);

const AUGMENTS = augmentMap as Record<string, { name: string; icon: string; level: string }>;
const { augmentOf: aramggAugmentOf, ensure: ensureAramgg } = useAramgg();
onMounted(() => {
  void ensureAramgg();
});

function augmentRarityLabel(level: string): string {
  return level === "kPrismatic" ? "棱彩" : level === "kGold" ? "黄金" : level === "kSilver" ? "白银" : "";
}

const augmentSlots = computed(() => {
  const slots: Array<{ id: number; name: string; title: string; icon: string; level: string }> = [];
  for (const key of ["playerAugment1", "playerAugment2", "playerAugment3", "playerAugment4", "playerAugment5", "playerAugment6"] as const) {
    const id = Number(props.player[key] ?? 0);
    if (!Number.isFinite(id) || id === 0) continue;
    const info = AUGMENTS[String(id)];
    const remote = aramggAugmentOf(id);
    const name = remote?.name || info?.name || "";
    const rarity = remote?.rarityDisplayName || augmentRarityLabel(info?.level ?? "");
    const stats = remote?.stats;
    const rate = typeof stats?.winRate === "number" ? "胜率 " + (stats.winRate * 100).toFixed(1) + "%" : "";
    const pick = typeof stats?.pickRate === "number" ? "选取率 " + (stats.pickRate * 100).toFixed(1) + "%" : "";
    const summary = [name, rarity, rate, pick].filter(Boolean).join(" · ");
    const description = remote?.description || "";
    slots.push({
      id,
      name,
      title: description ? summary + "\n" + description : summary,
      icon: remote?.iconUrl || (info?.icon ? runeIconUrl(info.icon) : ""),
      level: info?.level ?? ""
    });
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

/** 来源字段是否不完整：详情来源标记或玩家自带标记任一为真即视为不完整 */
const isPartial = computed(() => props.partial === true || props.player.partial === true);
const teamLabel = computed(() => {
  // 组队人数未知（undefined/null）或非正数时不显示徽标，不再用「单人」冒充
  if (!hasValue(props.player.teamMadeSize)) return "";
  const size = Number(props.player.teamMadeSize);
  if (size <= 0) return "";
  return getTeamMadeLabel(size, props.ranked ?? false) ?? "";
});
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
/** 装备位全空（7 格都缺失或为 0）且来源字段不完整 → 显示「装备未提供」 */
const itemsMissing = computed(() => isPartial.value && !itemSlots.value.some((id) => Number(id ?? 0) > 0));
/** 补刀与经济同时缺失：整列只显示一次「未提供」，避免重复 */
const economyMissing = computed(() => !hasValue(props.player.minionsKilled) && !hasValue(props.player.goldEarned));
/** 符文全部缺失（无基石图标、无基石/副系 id）且来源字段不完整 → 显示「符文未提供」 */
const runeMissing = computed(
  () =>
    isPartial.value &&
    !props.player.perkStyleUrl &&
    !(Number(props.player.keystoneId ?? 0) > 0) &&
    !(Number(props.player.perkSubStyle ?? 0) > 0)
);

const kda = computed(() => kdaRatio(props.player.championsKilled, props.player.numDeaths, props.player.assists));
const kdaText = computed(() => kda.value.toFixed(2) + " : 1");
const kdaClass = computed(() => (kda.value >= 5 ? "well" : kda.value >= 3 ? "normal" : "bad"));
const gameScore = computed(() => formatGameScore(props.player.gameScore));

/** LeagueAkari 风格：参与击杀率与伤害团队占比（按同队 10 人内数据归一） */
const teamKills = computed(() => statistics.value.teams.get(props.player.teamId)?.kills ?? 0);
const killParticipation = computed(() => {
  const tk = teamKills.value;
  if (!tk) return 0;
  return Math.round(((props.player.championsKilled + props.player.assists) / tk) * 100);
});
const teamDamage = computed(() => statistics.value.teams.get(props.player.teamId)?.damage ?? 0);
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
