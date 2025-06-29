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
          <InputGroup class="input-small">
            <InputNumber class="input-text-center" v-model="parentState.randomFreq[0]" />
            <InputGroupAddon>-</InputGroupAddon>
            <InputNumber class="input-text-center" v-model="parentState.randomFreq[1]" />
          </InputGroup>
        </div>
      </div>
    </div>
    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-35">基础强度</label>
      <InputNumber class="input-small" v-model="parentState.strengthVal" />
      <div class="flex-grow flex-shrink"></div>
    </div>
    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-35">随机强度</label>
      <InputNumber class="input-small" v-model="parentState.randomStrengthVal" />
      <div class="flex-grow flex-shrink"></div>
    </div>
    <div class="flex gap-8 mb-4 w-full">
      <div class="w-35"></div>
      <div class="opacity-60 text-right">
        强度范围：{{ parentState.strengthVal }} - {{ parentState.strengthVal + parentState.randomStrengthVal
        }}，强度上限请在DG-Lab中设置
      </div>
    </div>
    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-35">一键开火强度限制</label>
      <InputNumber class="input-small" v-model="parentState.fireStrengthLimit" />
      <div class="flex-grow flex-shrink"></div>
    </div>
    <div class="flex items-center gap-2 lg:gap-8 mb-4 w-full">
      <label class="font-semibold w-35">B通道</label>
      <ToggleButton v-model="parentState.bChannelEnabled" onIcon="pi pi-circle-on" onLabel="已启用"
        offIcon="pi pi-circle-off" offLabel="已禁用" />
    </div>
    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-35">B通道强度倍数</label>
      <InputNumber class="input-small" :disabled="!parentState.bChannelEnabled"
        v-model="parentState.bChannelMultiple" />
      <div class="flex-grow flex-shrink"></div>
    </div>
    <div class="flex gap-8 w-full">
      <div class="w-35"></div>
      <div class="opacity-60 text-right">
        B通道的强度 = A通道强度 * 强度倍数
      </div>
    </div>
    <CoyoteLocalConnectPanel></CoyoteLocalConnectPanel>
  </div>
</template>