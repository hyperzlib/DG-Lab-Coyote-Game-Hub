<script lang="ts" setup>
import Button from 'primevue/button';
import Chip from 'primevue/chip';

import BatteryIcon from '../../assets/battery.svg';

import { ToastServiceMethods } from 'primevue/toastservice';
import { ConfirmationOptions } from 'primevue/confirmationoptions';
import { CoyoteDeviceVersion } from '../../type/common';
import { useCoyoteBTStore } from '../../stores/CoyoteBTStore';

defineOptions({
  name: 'CoyoteBluetoothPanel',
});

const state = useCoyoteBTStore();

const toast = inject<ToastServiceMethods>('parentToast');
const confirm = inject<{
  require: (option: ConfirmationOptions) => void;
  close: () => void;
}>('parentConfirm');

const handleStopBluetoothConnect = () => {
  confirm?.require({
    header: '断开蓝牙连接',
    message: '确定要断开蓝牙连接吗？',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '确定',
    rejectLabel: '取消',
    rejectProps: {
      severity: 'secondary',
    },
    accept: async () => {
      state.disconnect();
      toast?.add({ severity: 'success', summary: '断开成功', detail: '已断开蓝牙连接', life: 3000 });
    },
  });
};
</script>

<template>
  <div v-if="state.connected" class="pb-2">
    <Divider></Divider>

    <div class="flex flex-row justify-between gap-2 mt-4 mb-4 items-start md:items-center">
      <h2 class="font-bold text-xl">蓝牙连接</h2>
      <div class="flex gap-2 items-center">
        <Button icon="pi pi-times" label="断开" severity="secondary" @click="handleStopBluetoothConnect"></Button>
      </div>
    </div>

    <div class="w-full flex flex-col md:flex-row gap-2 lg:gap-8 mb-8 lg:mb-6">
      <Chip class="py-0 pl-0 w-full">
        <div
          class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <BatteryIcon class="w-5 h-5"></BatteryIcon>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceBattery }}%</div>
      </Chip>
      <Chip class="py-0 pl-0 w-full">
        <div
          class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <i class="pi pi-bolt"></i>
          <span class="ml-[-2px]">A</span>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceStrengthA }}</div>
      </Chip>
      <Chip class="py-0 pl-0 w-full">
        <div
          class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <i class="pi pi-bolt"></i>
          <span class="ml-[-2px]">B</span>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceStrengthB }}</div>
      </Chip>
    </div>

    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4"
      v-if="state.deviceVersion === CoyoteDeviceVersion.V2">
      <label class="font-semibold w-30">频率平衡参数</label>
      <InputNumber class="input-small" v-model="state.freqBalance" :min="0" :max="200" />
    </div>

    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
      <label class="font-semibold w-30 flex-shrink-0">强度上限</label>
      <div class="w-full flex flex-row gap-4">
        <InputGroup>
          <InputGroupAddon>A</InputGroupAddon>
          <InputNumber v-model="state.inputLimitA" :min="1" :max="200" />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>B</InputGroupAddon>
          <InputNumber v-model="state.inputLimitB" :min="1" :max="200" />
        </InputGroup>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bg-primary {
  background-color: var(--p-primary-color);
}

.text-primary-contrast {
  color: var(--p-primary-contrast-color);
}
</style>