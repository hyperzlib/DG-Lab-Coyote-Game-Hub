<script lang="ts" setup>
defineOptions({
  name: 'GameConnection',
});

const props = defineProps<{
  state: any;
}>(); 
</script>

<template>

  <div class="flex flex-col justify-between gap-2 mb-2 items-start md:flex-row md:items-center">
    <h2 class="font-bold text-xl">波形列表</h2>
  </div>
</template>