<script lang="ts" setup>
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import StatusChart from '../charts/Circle1.vue';

import { GameConfigType, GameStrengthConfig, MainGameConfig, PulseItemResponse, PulsePlayMode, SocketApi } from '../apis/socketApi';
import { ClientConnectUrlInfo, ServerInfoResData, webApi } from '../apis/webApi';
import { handleApiResponse } from '../utils/response';
import { simpleObjDiff } from '../utils/utils';
import { PulseItemInfo } from '../type/pulse';
import { useConfirm } from 'primevue/useconfirm';
import { ConnectorType, CoyoteDeviceVersion } from '../type/common';
import CoyoteBluetoothPanel from '../components/partials/CoyoteBluetoothPanel.vue';
import PulseSettings from '../components/partials/PulseSettings.vue';
import ClientInfoDialog from '../components/dialogs/ClientInfoDialog.vue';
import { useClientsStore } from '../stores/ClientsStore';
import ConnectToSavedClientsDialog from '../components/dialogs/ConnectToSavedClientsDialog.vue';
import { useRemoteNotificationStore } from '../stores/RemoteNotificationStore';

export interface ControllerPageState {
  strengthVal: number;
  randomStrengthVal: number;
  strengthLimit: number;
  tempStrength: number;
  randomFreq: number[];
  bChannelEnabled: boolean;
  bChannelMultiple: number;
  pulseList: PulseItemInfo[] | null;
  customPulseList: PulseItemInfo[];
  selectPulseIds: string[];
  firePulseId: string;
  pulseMode: PulsePlayMode;
  pulseChangeInterval: number;
  newClientName: string;
  clientId: string;
  clientWsUrlList: ClientConnectUrlInfo[] | null;
  clientStatus: 'init' | 'waiting' | 'connected';
  apiBaseHttpUrl: string;
  connectorType: ConnectorType;
  gameStarted: boolean;
  showConnectionDialog: boolean;
  showClientInfoDialog: boolean;
  showLiveCompDialog: boolean;
  showConfigSavePrompt: boolean;
  showClientNameDialog: boolean;
  showConnectToSavedClientsDialog: boolean;
}

const state = reactive<ControllerPageState>({
  strengthVal: 5,
  randomStrengthVal: 5,
  strengthLimit: 20,

  tempStrength: 0,

  randomFreq: [5, 10],

  bChannelEnabled: false,
  bChannelMultiple: 1,

  pulseList: null as PulseItemInfo[] | null,
  customPulseList: [] as PulseItemInfo[],
  selectPulseIds: [''],
  firePulseId: '',

  pulseMode: 'single',
  pulseChangeInterval: 60,

  newClientName: '',
  clientId: '',
  clientWsUrlList: null as ClientConnectUrlInfo[] | null,

  clientStatus: 'init' as 'init' | 'waiting' | 'connected',

  apiBaseHttpUrl: '',

  connectorType: ConnectorType.DGLAB as ConnectorType,

  gameStarted: false,

  showConnectionDialog: false,
  showClientInfoDialog: false,
  showLiveCompDialog: false,
  showConfigSavePrompt: false,
  showClientNameDialog: false,
  showConnectToSavedClientsDialog: false,
});

const btPanelRef = ref<InstanceType<typeof CoyoteBluetoothPanel> | null>(null);

// 在收到服务器的配置后设置为true，防止触发watch
let receivedConfig = false;

let oldGameConfig: MainGameConfig | null = null;
const gameConfig = computed<MainGameConfig>({
  get: () => {
    return {
      strengthChangeInterval: state.randomFreq,
      enableBChannel: state.bChannelEnabled,
      bChannelStrengthMultiplier: state.bChannelMultiple,
      pulseId: state.selectPulseIds.length === 1 ? state.selectPulseIds[0] : state.selectPulseIds,
      firePulseId: state.firePulseId === '' ? null : state.firePulseId,
      pulseMode: state.pulseMode,
      pulseChangeInterval: state.pulseChangeInterval,
    } as MainGameConfig;
  },
  set: (value) => {
    state.randomFreq = value.strengthChangeInterval;
    state.bChannelEnabled = value.enableBChannel;
    state.bChannelMultiple = value.bChannelStrengthMultiplier;
    state.selectPulseIds = typeof value.pulseId === 'string' ? [value.pulseId] : value.pulseId || [''];
    state.firePulseId = value.firePulseId || '';
    state.pulseMode = value.pulseMode;
    state.pulseChangeInterval = value.pulseChangeInterval;
  }
});

let oldStrengthConfig: GameStrengthConfig | null = null;
const strengthConfig = computed<GameStrengthConfig>({
  get: () => {
    return {
      strength: state.strengthVal,
      randomStrength: state.randomStrengthVal,
    } as GameStrengthConfig;
  },
  set: (value) => {
    state.strengthVal = value.strength;
    state.randomStrengthVal = value.randomStrength;
  }
});

const chartVal = computed(() => ({
  valLow: Math.min(state.strengthVal + state.tempStrength, state.strengthLimit),
  valHigh: Math.min(state.strengthVal + state.tempStrength + state.randomStrengthVal, state.strengthLimit),
  valLimit: state.strengthLimit,
}));

const toast = useToast();
const confirm = useConfirm();

const clientsStore = useClientsStore();
const remoteNotificationStore = useRemoteNotificationStore();

provide('parentToast', toast);
provide('parentConfirm', confirm);

let serverInfo: ServerInfoResData;
let wsClient: SocketApi;
let dgClientConnected = false;

const initServerInfo = async () => {
  try {
    let serverInfoRes = await webApi.getServerInfo();

    handleApiResponse(serverInfoRes);

    serverInfo = serverInfoRes!;
    state.clientWsUrlList = serverInfo.server.clientWsUrls;
    state.apiBaseHttpUrl = serverInfo.server.apiBaseHttpUrl;
  } catch (error: any) {
    console.error('Cannot get server info:', error);
    toast.add({ severity: 'error', summary: '获取服务器信息失败', detail: error.message });
  }
};

const initWebSocket = async () => {
  if (wsClient) return;

  wsClient = new SocketApi(serverInfo.server.wsUrl);

  wsClient.on('open', () => {
    // 此事件在重连时也会触发
    console.log('WebSocket connected or re-connected');
    if (state.clientId) { // 已有clientId，直接绑定
      bindClient();
    }
  });

  wsClient.on('pulseListUpdated', (data: PulseItemResponse[]) => {
    console.log('Pulse list updated:', data);
    state.pulseList = data;
  });

  wsClient.on('clientConnected', () => {
    console.log('DG-Lab client connected');

    state.showConnectionDialog = false; // 关闭连接对话框
    state.clientStatus = 'connected';
    dgClientConnected = true;

    handleClientConnected();

    toast.add({ severity: 'success', summary: '客户端连接成功', detail: '已连接到客户端', life: 3000 });
  });

  wsClient.on('clientDisconnected', () => {
    console.log('DG-Lab client disconnected');

    state.clientStatus = 'waiting';
    state.gameStarted = false;

    dgClientConnected = false;
  });

  wsClient.on('gameStarted', () => {
    state.gameStarted = true;
  });

  wsClient.on('gameStopped', () => {
    state.gameStarted = false;
  });

  wsClient.on('strengthChanged', (strength) => {
    state.strengthLimit = strength.limit;
    state.tempStrength = strength.tempStrength;
  });

  wsClient.on('strengthConfigUpdated', (config) => {
    if (state.showConfigSavePrompt) {
      // 当前有配置未保存，不更新配置，只替换旧配置
      oldStrengthConfig = config;
    } else {
      // 覆盖本地配置
      strengthConfig.value = config;
      oldStrengthConfig = config;

      // 屏蔽保存提示
      receivedConfig = true;
      nextTick(() => {
        receivedConfig = false;
      });
    }
  });

  wsClient.on('mainGameConfigUpdated', (config) => {
    if (state.showConfigSavePrompt) {
      // 当前有配置未保存，不更新配置，只替换旧配置
      oldGameConfig = config;
    } else {
      // 覆盖本地配置
      gameConfig.value = config;
      oldGameConfig = config;

      // 屏蔽保存提示
      receivedConfig = true;
      nextTick(() => {
        receivedConfig = false;
      });
    }
  });

  wsClient.on('customPulseConfigUpdated', (config) => {
    state.customPulseList = config.customPulseList;
  });

  wsClient.on('remoteNotification', (notification) => {
    if (notification.ignoreId && remoteNotificationStore.isIgnored(notification.ignoreId)) {
      // 已忽略的通知不显示
      return;
    }

    toast.add({
      severity: (notification.severity as unknown as 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast' | undefined) || 'info',
      summary: notification.title || '站点通知',
      detail: {
        type: 'custom',
        ...notification,
      },
      life: notification.sticky ? undefined : 5000,
    });
  });

  wsClient.connect();
};

const initClientConnection = async () => {
  try {
    let res = await webApi.getClientConnectInfo();
    handleApiResponse(res);
    state.clientId = res!.clientId;

    bindClient();
  } catch (error: any) {
    console.error('Cannot get client ws url list:', error);
    toast.add({ severity: 'error', summary: '获取客户端连接地址失败', detail: error.message });
  }
};

const bindClient = async () => {
  if (!state.clientId) return;
  if (!wsClient?.isConnected) return;

  try {
    state.clientStatus = 'waiting';
    let res = await wsClient.bindClient(state.clientId);
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot bind client:', error);
    toast.add({ severity: 'error', summary: '绑定客户端失败', detail: error.message });
  }
};

const handleClientConnected = () => {
  if (state.clientId) {
    const clientInfo = clientsStore.getClientInfo(state.clientId);
    if (!clientInfo) {
      // 初次连接时保存客户端
      state.newClientName = new Date().toLocaleString() + ' 连接的设备';
      state.showClientNameDialog = true;

    } else {
      // 更新连接时间
      clientsStore.updateClientConnectTime(state.clientId);
    }
  }
};

const handleSaveClientConnect = async (clientName: string) => {
  clientsStore.addClient(state.clientId, clientName);
};

const showConnectionDialog = () => {
  state.showConnectionDialog = true;

  if (!state.clientId) {
    initClientConnection();
  }
};

const showLiveCompDialog = () => {
  state.showLiveCompDialog = true;

  if (!state.clientId) {
    initClientConnection();
  }
};

const handleResetClientId = () => {
  initClientConnection();
};

const handleConnSetClientId = (clientId: string) => {
  state.clientId = clientId;

  bindClient();

  // 关闭连接对话框
  state.showConnectionDialog = false;
};

const postConfig = async () => {
  try {
    if (simpleObjDiff(oldStrengthConfig, strengthConfig.value)) {
      let res = await wsClient.updateStrengthConfig(strengthConfig.value);
      handleApiResponse(res);
      oldStrengthConfig = strengthConfig.value;
    }

    if (simpleObjDiff(oldGameConfig, gameConfig.value)) {
      let res = await wsClient.updateConfig(GameConfigType.MainGame, gameConfig.value);
      handleApiResponse(res);
      oldGameConfig = gameConfig.value;
    }

    toast.add({ severity: 'success', summary: '保存成功', detail: '游戏配置已保存', life: 3000 });
  } catch (error: any) {
    console.error('Cannot post config:', error);
  }
};

const postCustomPulseConfig = async () => {
  try {
    let res = await wsClient.updateConfig(GameConfigType.CustomPulse, {
      customPulseList: state.customPulseList,
    });
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot post custom pulse config:', error);
  }
};

const handleStartGame = async () => {
  if (!dgClientConnected) {
    toast.add({ severity: 'warn', summary: '未连接到客户端', detail: '启动输出需要先连接到客户端', life: 5000 });
    return;
  }

  try {
    let res = await wsClient.startGame();
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot start game:', error);
  }
};

const handleStopGame = async () => {
  if (!dgClientConnected) {
    toast.add({ severity: 'warn', summary: '未连接到客户端', detail: '暂停输出需要先连接到客户端', life: 5000 });
    return;
  }

  try {
    let res = await wsClient.stopGame();
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot pause game:', error);
  }
};

const handleSaveConfig = () => {
  postConfig();
  state.showConfigSavePrompt = false;
};

const handleCancelSaveConfig = () => {
  if (oldGameConfig) {
    gameConfig.value = oldGameConfig;
  }
  if (oldStrengthConfig) {
    strengthConfig.value = oldStrengthConfig;
  }

  state.showConfigSavePrompt = false;

  receivedConfig = true;
  nextTick(() => {
    receivedConfig = false;
  });
};

const handleStartBluetoothConnect = (deviceVersion: CoyoteDeviceVersion) => {
  btPanelRef.value?.startBluetoothConnect(deviceVersion);
};

onMounted(async () => {
  if (clientsStore.clientList.length > 0) {
    // 有保存的客户端，显示连接对话框
    state.showConnectToSavedClientsDialog = true;
  }

  await initServerInfo();
  await initWebSocket();
});

watch(() => state.pulseMode, (newVal) => {
  if (newVal === 'single' && state.selectPulseIds.length > 1) { // 单波形模式下只保留第一个波形
    state.selectPulseIds = [state.selectPulseIds[0]];
  }
});

watch([gameConfig, strengthConfig], () => {
  if (receivedConfig) { // 收到服务器配置后不触发保存提示
    receivedConfig = false;
    return;
  }

  state.showConfigSavePrompt = true; // 显示保存提示
}, { deep: true });
</script>

<template>
  <div class="w-full page-container">
    <Toast>
      <template #container="{ message, closeCallback }">
        <CustomToastContent :message="message" :close-callback="closeCallback" />
      </template>
    </Toast>
    <ConfirmDialog></ConfirmDialog>
    <div class="flex flex-col lg:flex-row items-center lg:items-start gap-8">
      <div class="flex">
        <StatusChart v-model:val-low="chartVal.valLow" v-model:val-high="chartVal.valHigh"
          :val-limit="chartVal.valLimit" :running="state.gameStarted" readonly />
      </div>

      <Card class="controller-panel flex-grow-1 flex-shrink-1 w-full">
        <template #header>
          <Toolbar class="controller-toolbar">
            <template #start>
              <Button icon="pi pi-qrcode" class="mr-2" severity="secondary" label="连接"
                :disabled="state.clientStatus === 'connected'"
                :title="state.clientStatus === 'connected' ? '请先断开当前设备连接' : '连接设备'"
                @click="showConnectionDialog()"></Button>
              <Button icon="pi pi-info-circle" class="mr-4" severity="secondary" label="信息"
                :disabled="state.clientStatus === 'init'" @click="state.showClientInfoDialog = true"></Button>
              <span class="text-red-600 block flex items-center gap-1 mr-2" v-if="state.clientStatus === 'init'">
                <i class="pi pi-circle-off"></i>
                <span>未连接</span>
              </span>
              <span class="text-green-600 block flex items-center gap-1 mr-2"
                v-else-if="state.clientStatus === 'connected'">
                <i class="pi pi-circle-on"></i>
                <span>已连接</span>
              </span>
              <span class="text-yellow-600 block flex items-center gap-1 mr-2" v-else>
                <i class="pi pi-spin pi-spinner"></i>
                <span>等待连接</span>
              </span>
            </template>
            <template #end>
              <Button icon="pi pi-file-export" class="mr-2" severity="secondary" label="添加到OBS"
                @click="showLiveCompDialog()"></Button>
              <Button icon="pi pi-play" class="mr-2" severity="secondary" label="启动输出" v-if="!state.gameStarted"
                @click="handleStartGame()"></Button>
              <Button icon="pi pi-pause" class="mr-2" severity="secondary" label="暂停输出" v-else
                @click="handleStopGame()"></Button>
            </template>
          </Toolbar>
        </template>

        <template #content>
          <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
            <label class="font-semibold w-30 flex-shrink-0">强度变化频率</label>
            <div class="w-full flex-shrink flex gap-2 flex-col lg:items-center lg:flex-row lg:gap-8">
              <div class="h-6 lg:h-auto flex-grow flex items-center">
                <Slider class="w-full" v-model="state.randomFreq" range :max="60" />
              </div>
              <div class="w-40">
                <InputGroup class="input-small">
                  <InputNumber class="input-text-center" v-model="state.randomFreq[0]" />
                  <InputGroupAddon>-</InputGroupAddon>
                  <InputNumber class="input-text-center" v-model="state.randomFreq[1]" />
                </InputGroup>
              </div>
            </div>
          </div>
          <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
            <label class="font-semibold w-30">基础强度</label>
            <InputNumber class="input-small" v-model="state.strengthVal" />
            <div class="flex-grow flex-shrink"></div>
          </div>
          <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
            <label class="font-semibold w-30">随机强度</label>
            <InputNumber class="input-small" v-model="state.randomStrengthVal" />
            <div class="flex-grow flex-shrink"></div>
          </div>
          <div class="flex gap-8 mb-4 w-full">
            <div class="w-30"></div>
            <div class="opacity-60 text-right">
              强度范围：{{ state.strengthVal }} - {{ state.strengthVal + state.randomStrengthVal }}，强度上限请在DG-Lab中设置
            </div>
          </div>
          <div class="flex items-center gap-2 lg:gap-8 mb-4 w-full">
            <label class="font-semibold w-30">B通道</label>
            <ToggleButton v-model="state.bChannelEnabled" onIcon="pi pi-circle-on" onLabel="已启用"
              offIcon="pi pi-circle-off" offLabel="已禁用" />
          </div>
          <div class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4">
            <label class="font-semibold w-30">B通道强度倍数</label>
            <InputNumber class="input-small" :disabled="!state.bChannelEnabled" v-model="state.bChannelMultiple" />
            <div class="flex-grow flex-shrink"></div>
          </div>
          <div class="flex gap-8 mb-4 w-full">
            <div class="w-30"></div>
            <div class="opacity-60 text-right">
              B通道的强度 = A通道强度 * 强度倍数
            </div>
          </div>
          <CoyoteBluetoothPanel :state="state" ref="btPanelRef"></CoyoteBluetoothPanel>
          <Divider></Divider>
          <PulseSettings :state="state" @post-custom-pulse-config="postCustomPulseConfig" />
        </template>
      </Card>
    </div>

    <ConnectToClientDialog v-model:visible="state.showConnectionDialog" :clientWsUrlList="state.clientWsUrlList"
      :client-id="state.clientId" @reset-client-id="handleResetClientId" @update:client-id="handleConnSetClientId"
      @start-bluetooth-connect="handleStartBluetoothConnect" />
    <ClientInfoDialog v-model:visible="state.showClientInfoDialog" :client-id="state.clientId" :controller-url="state.apiBaseHttpUrl"
      :connector-type="state.connectorType" />
    <GetLiveCompDialog v-model:visible="state.showLiveCompDialog" :client-id="state.clientId" />
    <ConfigSavePrompt :visible="state.showConfigSavePrompt" @save="handleSaveConfig" @cancel="handleCancelSaveConfig" />
    <ConnectToSavedClientsDialog v-model:visible="state.showConnectToSavedClientsDialog"
      @confirm="handleConnSetClientId" />
    <PromptDialog v-model:visible="state.showClientNameDialog" title="保存客户端" message="将此设备保存到本地，以便于下次连接。波形列表将跟随设备保存。"
      input-label="客户端备注名" :default-value="state.newClientName" :allow-empty="false"
      @confirm="handleSaveClientConnect" />
  </div>
</template>

<style>
body {
  background: #eff0f0;
}

@media (prefers-color-scheme: dark) {
  body {
    background: #000;
  }
}

.popover-pulseTime::before,
.popover-pulseTime::after {
  display: none;
}
</style>

<style lang="scss">
$container-max-widths: (
  md: 768px,
  lg: 960px,
  xl: 1100px,
);

.page-container {
  margin-top: 2rem;
  margin-bottom: 6rem; // 为底部toast留出空间
  margin-left: auto;
  margin-right: auto;
  padding: 0 1rem;
  width: 100%;
}

@media (min-width: 768px) {
  .page-container {
    max-width: map-get($container-max-widths, lg);
  }
}

@media (min-width: 1024px) {
  .page-container {
    max-width: map-get($container-max-widths, xl);
  }
}

.controller-panel {
  background: #fcfcfc;
  border-radius: 0.8rem;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;

  .input-small {
    height: 32px;
    --p-inputtext-padding-y: 0.25rem;
  }

  .input-text-center input {
    text-align: center;
  }

  .inner-tabs {
    --p-tabs-tablist-background: transparent;
    --p-tabs-tab-padding: 0.5rem 1.5rem;
  }
}

.controller-toolbar {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid #e0e0e0;
}

@media (prefers-color-scheme: dark) {
  .controller-panel {
    background: #121212;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  }

  .controller-toolbar {
    border-bottom: 1px solid #333;
  }
}
</style>
