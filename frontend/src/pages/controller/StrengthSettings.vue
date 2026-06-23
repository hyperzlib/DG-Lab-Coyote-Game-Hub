<script lang="ts" setup>
import { ControllerPageState } from '../../pages/Controller.vue';
import { Reactive } from 'vue';

import CoyoteLocalConnectPanel from '../../components/partials/CoyoteLocalConnectPanel.vue';

defineOptions({
  name: 'StrengthSettings',
});

const props = defineProps<{
  state: any;
}>();

// 从父组件获取state
let parentState: Reactive<ControllerPageState>;
watch(() => props.state, (value) => {
  parentState = value;
}, { immediate: true });

const bChannelModeOptions = [
  { label: '关闭', value: 'off' },
  { label: '独立', value: 'discrete' },
  { label: '同步', value: 'sync' },
];
</script>

<template>
  <div class="w-full">
    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-35 flex-shrink-0">强度变化频率</label>
      <div class="w-full flex-shrink flex gap-2 flex-col lg:items-center lg:flex-row lg:gap-8">
        <div class="h-6 lg:h-auto flex-grow flex items-center">
          <Slider class="w-full" v-model="parentState.randomFreq" range :max="60" />
        </div>
        <div class="w-40">
          <InputGroup class="input-group-small">
            <InputNumber class="input-text-center" v-model="parentState.randomFreq[0]" />
            <InputGroupAddon>-</InputGroupAddon>
            <InputNumber class="input-text-center" v-model="parentState.randomFreq[1]" />
          </InputGroup>
        </div>
      </div>
    </div>
    <div class="w-full flex flex-col md:flex-row gap-2 lg:gap-8 mb-8 lg:mb-6">
      <template v-if="parentState.bChannelMode === 'discrete'">
        <CoyoteStrengthPanel class="flex-1" v-model:strength="parentState.strength.main.strength"
          v-model:randomStrength="parentState.strength.main.randomStrength"
          v-model:fireStrengthLimit="parentState.fireStrengthLimit.main"
          :strengthLimit="parentState.strengthInfo.main.strengthLimit" iconText="A" />
        <CoyoteStrengthPanel class="flex-1" v-model:strength="parentState.strength.channelB.strength"
          v-model:randomStrength="parentState.strength.channelB.randomStrength"
          v-model:fireStrengthLimit="parentState.fireStrengthLimit.channelB"
          :strengthLimit="parentState.strengthInfo.channelB.strengthLimit" iconText="B" />
      </template>
      <template v-else>
        <CoyoteStrengthPanel class="flex-1" v-model:strength="parentState.strength.main.strength"
          v-model:randomStrength="parentState.strength.main.randomStrength"
          v-model:fireStrengthLimit="parentState.fireStrengthLimit.main"
          :strengthLimit="parentState.strengthInfo.main.strengthLimit" fluid />
      </template>
    </div>
    <div class="flex items-center gap-2 lg:gap-8 mb-4 w-full">
      <label class="font-semibold w-35">B通道模式</label>
      <SelectButton :options="bChannelModeOptions" optionLabel="label" optionValue="value"
        v-model="parentState.bChannelMode" :allowEmpty="false" aria-labelledby="basic" />
    </div>
    <div v-if="parentState.bChannelMode === 'sync'"
      class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-4">
      <label class="font-semibold w-35">B通道强度倍数</label>
      <InputNumber class="input-small" v-model="parentState.bChannelMultiple" />
      <div class="flex-grow flex-shrink"></div>
    </div>
    <div class="flex gap-2 lg:gap-8 w-full">
      <div class="w-35"></div>
      <div class="opacity-60 text-left flex-1">
        <span v-if="parentState.bChannelMode === 'off'">
          当前B通道无输出，选择独立模式以让B通道单独输出，选择同步模式以让B通道与A通道同步
        </span>
        <span v-else-if="parentState.bChannelMode === 'sync'">
          同步模式下，B通道的强度 = A通道强度 * 强度倍数
        </span>
        <span v-else-if="parentState.bChannelMode === 'discrete'">
          独立模式下，支持新版API的插件可以单独控制两个通道的强度，旧版API通过不同链接码可以分别控制A/B通道的强度输出
        </span>
      </div>
    </div>
    <CoyoteLocalConnectPanel></CoyoteLocalConnectPanel>
  </div>
</template>