<script lang="ts" setup>
import Button from 'primevue/button';
import Chip from 'primevue/chip';

import BatteryIcon from '../../assets/battery.svg';

import { ToastServiceMethods } from 'primevue/toastservice';
import { CoyoteBluetoothController } from '../../utils/CoyoteBluetoothController';
import { ConfirmationOptions } from 'primevue/confirmationoptions';
import { ConnectorType, CoyoteDeviceVersion } from '../../type/common';
import { Reactive } from 'vue';
import { ControllerPageState } from '../../pages/Controller.vue';

defineOptions({
  name: 'CoyoteBluetoothPanel',
});

const BT_CONFIG_STORAGE_KEY = 'CGH_BTClientConfig';

const props = defineProps<{
  state: any;
}>();

// 从父组件获取state
let parentState: Reactive<ControllerPageState>;
watch(() => props.state, (value) => {
  parentState = value;
}, { immediate: true });

const state = reactive({
  connected: false,

  deviceBattery: 100,
  deviceStrengthA: 0,
  deviceStrengthB: 0,

  freqBalance: 150,
  inputLimitA: 20,
  inputLimitB: 20,
});

const toast = inject<ToastServiceMethods>('parentToast');
const confirm = inject<{
  require: (option: ConfirmationOptions) => void;
  close: () => void;
}>('parentConfirm');

/** 蓝牙控制器 */
let bluetoothController: CoyoteBluetoothController | null = null;

// 蓝牙连接相关
const startBluetoothConnect = async (deviceVersion: CoyoteDeviceVersion) => {
  parentState.showConnectionDialog = false;

  if (!bluetoothController) {
    bluetoothController = new CoyoteBluetoothController(deviceVersion, parentState.clientId);
  }

  try {
    confirm?.require({
      header: '蓝牙连接',
      message: '扫描中，请在弹出窗口中选择扫描到的设备，然后点击“配对”按钮。',
      acceptClass: 'd-none',
      rejectClass: 'd-none',
    });

    await bluetoothController.scan();

    confirm?.require({
      header: '蓝牙连接',
      message: '正在连接到蓝牙设备，这可能需要十几秒的时间',
      acceptClass: 'd-none',
      rejectClass: 'd-none',
    });

    await bluetoothController.connect();
    bindBTControllerEvents();

    confirm?.close();
    toast?.add({ severity: 'success', summary: '连接成功', detail: '已连接到蓝牙控制器', life: 3000 });

    if (deviceVersion === CoyoteDeviceVersion.V2) {
      parentState.connectorType = ConnectorType.COYOTE_BLE_V2;
    } else {
      parentState.connectorType = ConnectorType.COYOTE_BLE_V3;
    }

    state.connected = true;
    window.onbeforeunload = (event) => {
      event.preventDefault();
      return '确定要断开蓝牙连接吗？';
    };
  } catch (error: any) {
    confirm?.close();
    console.error('Cannot connect via bluetooth:', error);
    toast?.add({ severity: 'error', summary: '连接失败', detail: error.message });
  }
};

const bindBTControllerEvents = () => {
  if (!bluetoothController) {
    return;
  }

  bluetoothController.on('batteryLevelChange', (battery) => {
    state.deviceBattery = battery;
  });

  bluetoothController.on('strengthChange', (strengthA, strengthB) => {
    state.deviceStrengthA = strengthA;
    state.deviceStrengthB = strengthB;
  });
};

const stopBluetoothConnect = async () => {
  bluetoothController?.cleanup();
  bluetoothController = null;
  state.connected = false;

  window.onbeforeunload = null;
};

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
      await stopBluetoothConnect();
      toast?.add({ severity: 'success', summary: '断开成功', detail: '已断开蓝牙连接', life: 3000 });
    },
  });
};

const saveLocalConfig = () => {
  localStorage.setItem(BT_CONFIG_STORAGE_KEY, JSON.stringify({
    freqBalance: state.freqBalance,
    inputLimitA: state.inputLimitA,
    inputLimitB: state.inputLimitB,
  }));
};

const loadLocalConfig = () => {
  const config = localStorage.getItem(BT_CONFIG_STORAGE_KEY);
  if (!config) {
    return;
  }

  const savedConfig = JSON.parse(config);
  if (!savedConfig) {
    return;
  }

  if (typeof savedConfig.freqBalance === 'number') {
    state.freqBalance = Math.min(200, Math.max(0, savedConfig.freqBalance));
  }
  
  if (typeof savedConfig.inputLimitA === 'number') {
    state.inputLimitA = Math.min(200, Math.max(1, savedConfig.inputLimitA));
  }

  if (typeof savedConfig.inputLimitB === 'number') {
    state.inputLimitB = Math.min(200, Math.max(1, savedConfig.inputLimitB));
  }
};

watch(() => parentState.clientId, async (newVal) => {
  if (newVal) {
    // 刷新客户端ID时断开蓝牙连接
    await stopBluetoothConnect();
  }
});

watch(() => [state.inputLimitA, state.inputLimitB], (newVal) => {
  if (bluetoothController) {
    bluetoothController.setStrengthLimit(newVal[0], newVal[1]);
    saveLocalConfig();
    toast?.add({ severity: 'success', summary: '设置成功', detail: '已更新强度上限', life: 3000 });
  }
}, { immediate: true });

watch(() => state.freqBalance, (newVal) => {
  if (bluetoothController && parentState.connectorType === ConnectorType.COYOTE_BLE_V2) {
    bluetoothController.setFreqBalance(newVal);
    saveLocalConfig();
    toast?.add({ severity: 'success', summary: '设置成功', detail: '已更新频率平衡参数', life: 3000 });
  }
}, { immediate: true });

onMounted(() => {
  loadLocalConfig();
});

defineExpose({
  startBluetoothConnect,
});
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
        <div class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <BatteryIcon class="w-5 h-5"></BatteryIcon>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceBattery }}%</div>
      </Chip>
      <Chip class="py-0 pl-0 w-full">
        <div class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <i class="pi pi-bolt"></i>
          <span class="ml-[-2px]">A</span>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceStrengthA }}</div>
      </Chip>
      <Chip class="py-0 pl-0 w-full">
        <div class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <i class="pi pi-bolt"></i>
          <span class="ml-[-2px]">B</span>
        </div>
        <div class="w-full text-center font-semibold text-lg">{{ state.deviceStrengthB }}</div>
      </Chip>
    </div>

    <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4"
      v-if="parentState.connectorType === ConnectorType.COYOTE_BLE_V2">
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