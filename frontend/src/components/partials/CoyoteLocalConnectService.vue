<script lang="ts" setup>
import { ToastServiceMethods } from 'primevue/toastservice';
import { CoyoteBluetoothController } from '../../controllers/CoyoteBluetoothController';
import { ConfirmationOptions } from 'primevue/confirmationoptions';
import { ConnectorType, CoyoteDeviceVersion } from '../../type/common';
import { Reactive } from 'vue';
import { ControllerPageState } from '../../pages/Controller.vue';
import { useCoyoteLocalConnStore } from '../../stores/CoyoteLocalConnStore';
import { CoyoteDebugDeviceController } from '../../controllers/CoyoteDebugDeviceController';

defineOptions({
  name: 'CoyoteLocalConnectService',
});

const props = defineProps<{
  state: any;
}>();

// 从父组件获取state
let parentState: Reactive<ControllerPageState>;
watch(() => props.state, (value) => {
  parentState = value;
}, { immediate: true });

const state = useCoyoteLocalConnStore();

const toast = inject<ToastServiceMethods>('parentToast');
const confirm = inject<{
  require: (option: ConfirmationOptions) => void;
  close: () => void;
}>('parentConfirm');

// 蓝牙连接相关
const startBluetoothConnect = async (deviceVersion: CoyoteDeviceVersion) => {
  parentState.showConnectionDialog = false;

  if (!state.controller) {
    state.controller = new CoyoteBluetoothController(deviceVersion, parentState.clientId);
  }

  try {
    confirm?.require({
      header: '蓝牙连接',
      message: '扫描中，请在弹出窗口中选择扫描到的设备，然后点击“配对”按钮。',
      acceptClass: 'd-none',
      rejectClass: 'd-none',
    });

    await state.controller.scan();

    confirm?.require({
      header: '蓝牙连接',
      message: '正在连接到蓝牙设备，这可能需要十几秒的时间',
      acceptClass: 'd-none',
      rejectClass: 'd-none',
    });

    await state.controller.connect();
    bindBTControllerEvents();

    confirm?.close();
    toast?.add({ severity: 'success', summary: '连接成功', detail: '已连接到蓝牙控制器', life: 3000 });

    if (deviceVersion === CoyoteDeviceVersion.V2) {
      parentState.connectorType = ConnectorType.COYOTE_BLE_V2;
    } else {
      parentState.connectorType = ConnectorType.COYOTE_BLE_V3;
    }
  } catch (error: any) {
    confirm?.close();
    console.error('Cannot connect via bluetooth:', error);
    toast?.add({ severity: 'error', summary: '连接失败', detail: error.message });
  }
};

const startLocalDebugConnect = async () => {
  parentState.showConnectionDialog = false;

  if (!state.controller) {
    state.controller = new CoyoteDebugDeviceController(parentState.clientId);
  }

  confirm?.require({
    header: '本地调试',
    message: '请允许通知权限',
    acceptClass: 'd-none',
    rejectClass: 'd-none',
  });
  
  try {
    await state.controller.connect();
    bindBTControllerEvents();
    confirm?.close();
    toast?.add({ severity: 'success', summary: '连接成功', detail: '已连接到本地调试控制器', life: 3000 });
  } catch (error: any) {
    confirm?.close();
    console.error('Cannot connect via local debug:', error);
    toast?.add({ severity: 'error', summary: '连接失败', detail: error.message });
  }

  parentState.connectorType = ConnectorType.COYOTE_BLE_V3;
};

const bindBTControllerEvents = () => {
  if (!state.controller) {
    return;
  }

  state.initConnection();

  state.controller.on('reconnecting', () => {
    confirm?.require({
      header: '蓝牙连接',
      message: '连接已断开，正在重新连接到蓝牙设备',
      acceptClass: 'd-none',
      rejectLabel: '取消',
      rejectProps: {
        severity: 'secondary',
      },
      reject: () => {
        state.disconnect();
        confirm?.close();
      },
    });
  });

  state.controller.on('connect', () => {
    // 重连成功
    confirm?.close();
  });

  state.controller.on('disconnect', () => {
    // 连接关闭
    confirm?.close();
  });
};

watch(() => parentState.clientId, (newVal) => {
  if (newVal) {
    // 刷新客户端ID时断开蓝牙连接
    state.disconnect();
  }
});

watch(() => [state.inputLimitA, state.inputLimitB], (newVal) => {
  if (state.controller) {
    state.controller.setStrengthLimit(newVal[0], newVal[1]);
    toast?.add({ severity: 'success', summary: '设置成功', detail: '已更新强度上限', life: 3000 });
  }
}, { immediate: true });

watch(() => state.freqBalance, (newVal) => {
  if (state.controller && parentState.connectorType === ConnectorType.COYOTE_BLE_V2) {
    state.controller.setFreqBalance(newVal);
    toast?.add({ severity: 'success', summary: '设置成功', detail: '已更新频率平衡参数', life: 3000 });
  }
}, { immediate: true });

defineExpose({
  startBluetoothConnect,
  startLocalDebugConnect,
});
</script>

<template></template>