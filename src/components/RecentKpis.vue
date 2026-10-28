<template>
  <div class="recent-kpis">
    <div class="recent-kpi">
      <span class="recent-wr" title="胜率 = 胜 /（胜 + 负），重开不计入分母"><b>{{ winRate }}%</b> 胜率</span>
    </div>
    <div class="recent-kpi">
      <span class="recent-kda" :title="'KDA =（击杀 + 助攻）/ 死亡；样本：' + titleText"><b>{{ avgKda }}</b> KDA</span>
    </div>
    <div class="recent-kpi">
      <span class="recent-wl"><b class="w">{{ wins }}</b>胜<b class="l">{{ losses }}</b>负</span>
      <span class="recent-kpi-label">近期战绩</span>
    </div>
    <div class="recent-kpi">
      <span class="recent-streak" :class="{ 'recent-streak--lose': firstIsLose, 'recent-streak--empty': !streak }">{{ streak || '暂无连胜 / 连败' }}</span>
      <span class="recent-kpi-label">连续表现</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  winRate: number;
  avgKda: string;
  wins: number;
  losses: number;
  streak: string;
  firstIsLose: boolean;
  titleText: string;
}>();
</script>
