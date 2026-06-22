<script lang="ts" setup>
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import StatusChart from '../charts/Circle1.vue';
import StatusChartMinimal from '../charts/Bar1.vue';

import SelectButton from 'primevue/selectbutton';

import { GameConfigType, GameStrengthConfig, MainGameConfig, PulseItemResponse, PulsePlayMode, SocketApi } from '../apis/socketApi';
import { ClientConnectUrlInfo, ServerInfoResData, webApi } from '../apis/webApi';
import { handleApiResponse } from '../utils/response';
import { simpleObjDiff } from '../utils/utils';
import { PulseItemInfo } from '../type/pulse';
import { useConfirm } from 'primevue/useconfirm';
import { Channelify, channelifyDefault, ConnectorType, CoyoteDeviceVersion } from '../type/common';
import CoyoteLocalConnectService from '../components/partials/CoyoteLocalConnectService.vue';
import ClientInfoDialog from '../components/dialogs/ClientInfoDialog.vue';
import { useClientsStore } from '../stores/ClientsStore';
import ConnectToSavedClientsDialog from '../components/dialogs/ConnectToSavedClientsDialog.vue';
import { useRemoteNotificationStore } from '../stores/RemoteNotificationStore';

export interface ControllerPagePulseState {
  selectPulseIds: string[];
  firePulseId: string;
  pulseMode: PulsePlayMode;
  pulseChangeInterval: number;
}

export interface ControllerPageStrengthConfigState {
  strength: number;
  randomStrength: number;
  fireStrengthLimit: number;
}

export interface ControllerPageStrengthInfoState {
  strengthLimit: number;
  tempStrength: number;
  currentStrength: number;
}

export interface ControllerPageState {
  controllerPage: 'strength' | 'pulse' | 'game';

  strength: Channelify<ControllerPageStrengthConfigState>;
  strengthInfo: Channelify<ControllerPageStrengthInfoState>;
  fireStrengthLimit: Channelify<number>;

  randomFreq: [number, number];
  bChannelMode: 'off' | 'sync' | 'discrete';
  bChannelMultiple: number;
  pulseList: PulseItemInfo[] | null;
  customPulseList: PulseItemInfo[];

  pulseConfig: Channelify<ControllerPagePulseState>;

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
  controllerPage: 'strength',

  strength: channelifyDefault({
    strength: 5,
    randomStrength: 5,
    fireStrengthLimit: 30
  }),

  strengthInfo: channelifyDefault({
    strengthLimit: 20,
    tempStrength: 0,
    currentStrength: 0
  }),

  fireStrengthLimit: channelifyDefault(30),

  randomFreq: [5, 10],

  bChannelMode: 'off' as 'off' | 'sync' | 'discrete',
  bChannelMultiple: 1,

  pulseList: null as PulseItemInfo[] | null,
  customPulseList: [] as PulseItemInfo[],

  pulseConfig: channelifyDefault({
    selectPulseIds: [''],
    firePulseId: '',
    pulseMode: 'single',
    pulseChangeInterval: 60,
  }),

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

const router = useRouter();

const coyoteLocalRef = ref<InstanceType<typeof CoyoteLocalConnectService> | null>(null);

const controllerPageTabs = [
  { title: '强度配置', id: 'strength', icon: 'pi pi-bolt' },
  { title: '波形配置', id: 'pulse', icon: 'pi pi-wave-pulse' },
  { title: '游戏连接', id: 'game', icon: 'pi pi-map' },
];

watch(() => state.controllerPage, (newVal) => {
  router.push({ path: newVal });
});

// 在收到服务器的配置后设置为true，防止触发watch
let receivedConfig = false;

let oldGameConfig: MainGameConfig | null = null;
const gameConfig = computed<MainGameConfig>({
  get: () => {
    return {
      fireStrengthLimit: state.fireStrengthLimit,
      strengthChangeInterval: state.randomFreq,
      bChannelMode: state.bChannelMode,
      bChannelStrengthMultiplier: state.bChannelMultiple,
      pulse: {
        main: {
          pulseId: state.pulseConfig.main.selectPulseIds.length === 1 ?
            state.pulseConfig.main.selectPulseIds[0] :
            state.pulseConfig.main.selectPulseIds,
          firePulseId: state.pulseConfig.main.firePulseId === '' ?
            null :
            state.pulseConfig.main.firePulseId,
          pulseMode: state.pulseConfig.main.pulseMode,
          pulseChangeInterval: state.pulseConfig.main.pulseChangeInterval,
        },
        channelB: {
          pulseId: state.pulseConfig.channelB.selectPulseIds.length === 1 ?
            state.pulseConfig.channelB.selectPulseIds[0] :
            state.pulseConfig.channelB.selectPulseIds,
          firePulseId: state.pulseConfig.channelB.firePulseId === '' ?
            null :
            state.pulseConfig.channelB.firePulseId,
          pulseMode: state.pulseConfig.channelB.pulseMode,
          pulseChangeInterval: state.pulseConfig.channelB.pulseChangeInterval,
        }
      }
    } as MainGameConfig;
  },
  set: (value) => {
    state.fireStrengthLimit = value.fireStrengthLimit;
    state.randomFreq = value.strengthChangeInterval;
    state.bChannelMode = value.bChannelMode;
    state.bChannelMultiple = value.bChannelStrengthMultiplier;

    state.pulseConfig.main.selectPulseIds = typeof value.pulse.main.pulseId === 'string' ?
      [value.pulse.main.pulseId] :
      value.pulse.main.pulseId || [''];
    state.pulseConfig.main.firePulseId = value.pulse.main.firePulseId || '';
    state.pulseConfig.main.pulseMode = value.pulse.main.pulseMode;
    state.pulseConfig.main.pulseChangeInterval = value.pulse.main.pulseChangeInterval;

    state.pulseConfig.channelB.selectPulseIds = typeof value.pulse.channelB.pulseId === 'string' ?
      [value.pulse.channelB.pulseId] :
      value.pulse.channelB.pulseId || [''];
    state.pulseConfig.channelB.firePulseId = value.pulse.channelB.firePulseId || '';
    state.pulseConfig.channelB.pulseMode = value.pulse.channelB.pulseMode;
    state.pulseConfig.channelB.pulseChangeInterval = value.pulse.channelB.pulseChangeInterval;
  }
});

let oldStrengthConfig: GameStrengthConfig | null = null;
const strengthConfig = computed<GameStrengthConfig>({
  get: () => {
    return {
      main: {
        ...state.strength.main,
      },
      channelB: {
        ...state.strength.channelB,
      },
    } as GameStrengthConfig;
  },
  set: (value) => {
    state.strength.main.strength = value.main.strength;
    state.strength.main.randomStrength = value.main.randomStrength;

    state.strength.channelB.strength = value.channelB.strength;
    state.strength.channelB.randomStrength = value.channelB.randomStrength;
  }
});

const chartVal = computed<Channelify<{
  valLow: number;
  valHigh: number;
  valLimit: number;
  valTemp: number;
  valCurrent: number;
}>>(() => ({
  main: {
    valLow: Math.min(state.strength.main.strength + state.strengthInfo.main.tempStrength, state.strengthInfo.main.strengthLimit),
    valHigh: Math.min(state.strength.main.strength + state.strengthInfo.main.tempStrength + state.strength.main.randomStrength, state.strengthInfo.main.strengthLimit),
    valLimit: state.strengthInfo.main.strengthLimit,
    valTemp: state.strengthInfo.main.tempStrength,
    valCurrent: state.strengthInfo.main.currentStrength,
  },
  channelB: {
    valLow: Math.min(state.strength.channelB.strength + state.strengthInfo.channelB.tempStrength, state.strengthInfo.channelB.strengthLimit),
    valHigh: Math.min(state.strength.channelB.strength + state.strengthInfo.channelB.tempStrength + state.strength.channelB.randomStrength, state.strengthInfo.channelB.strengthLimit),
    valLimit: state.strengthInfo.channelB.strengthLimit,
    valTemp: state.strengthInfo.channelB.tempStrength,
    valCurrent: state.strengthInfo.channelB.currentStrength,
  }
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
    state.strengthInfo.main.strengthLimit = strength.main.limit;
    state.strengthInfo.main.tempStrength = strength.main.tempStrength;

    state.strengthInfo.channelB.strengthLimit = strength.channelB.limit;
    state.strengthInfo.channelB.tempStrength = strength.channelB.tempStrength;

    state.strengthInfo.main.currentStrength = strength.main.strength;
    state.strengthInfo.channelB.currentStrength = strength.channelB.strength;
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
      // 目前强度配置使用单独的控制面版，先移除保存提示，后续如果需要再调整
      // receivedConfig = true;
      // nextTick(() => {
      //   receivedConfig = false;
      // });
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
provide('postCustomPulseConfig', postCustomPulseConfig);

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
  coyoteLocalRef.value?.startBluetoothConnect(deviceVersion);
};

const handleStartDebugConnect = () => {
  coyoteLocalRef.value?.startLocalDebugConnect();
};

onMounted(async () => {
  if (clientsStore.clientList.length > 0) {
    // 有保存的客户端，显示连接对话框
    state.showConnectToSavedClientsDialog = true;
  }

  await initServerInfo();
  await initWebSocket();
});

watch(() => state.pulseConfig.main.pulseMode, (newVal) => {
  if (newVal === 'single' && state.pulseConfig.main.selectPulseIds.length > 1) { // 单波形模式下只保留第一个波形
    state.pulseConfig.main.selectPulseIds = [state.pulseConfig.main.selectPulseIds[0]];
  }
});

watch(() => state.pulseConfig.channelB.pulseMode, (newVal) => {
  if (newVal === 'single' && state.pulseConfig.channelB.selectPulseIds.length > 1) { // 单波形模式下只保留第一个波形
    state.pulseConfig.channelB.selectPulseIds = [state.pulseConfig.channelB.selectPulseIds[0]];
  }
});

watch(() => gameConfig, () => {
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
    <CoyoteLocalConnectService :state="state" ref="coyoteLocalRef"></CoyoteLocalConnectService>
    <div class="flex flex-col lg:flex-row items-center lg:items-start gap-8">
      <div class="flex flex-col items-center gap-4 w-full lg:w-auto">
        <StatusChart :val-low="chartVal.main.valLow" :val-high="chartVal.main.valHigh"
          :val-limit="chartVal.main.valLimit" :val-temp="chartVal.main.valCurrent" :val-current="chartVal.main.valTemp"
          :running="state.gameStarted" readonly />
        <StatusChartMinimal v-if="state.bChannelMode !== 'off'" :val-low="chartVal.channelB.valLow"
          :val-high="chartVal.channelB.valHigh" :val-limit="chartVal.channelB.valLimit"
          :val-temp="chartVal.channelB.valCurrent" :val-current="chartVal.channelB.valTemp" :running="state.gameStarted"
          readonly />
      </div>

      <Card class="controller-panel flex-grow-1 flex-shrink-1 w-full">
        <template #header>
          <div>
            <Toolbar class="controller-toolbar">
              <template #start>
                <Button icon="pi pi-qrcode" class="mr-4" severity="secondary" label="连接设备"
                  v-if="state.clientStatus !== 'connected'" @click="showConnectionDialog()"></Button>
                <Button v-else icon="pi pi-info-circle" class="mr-4" severity="secondary" label="连接信息"
                  @click="state.showClientInfoDialog = true"></Button>
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
            <div class="w-full px-2 controller-page-tabs">
              <SelectButton v-model="state.controllerPage" :options="controllerPageTabs" optionLabel="title"
                optionValue="id" dataKey="id" :allowEmpty="false" aria-labelledby="custom">
                <template #option="slotProps">
                  <div class="flex flex-col items-center gap-2 px-2 py-1">
                    <i :class="slotProps.option.icon"></i>
                    <span>{{ slotProps.option.title }}</span>
                  </div>
                </template>
              </SelectButton>
            </div>
          </div>
        </template>

        <template #content>
          <RouterView>
            <template #default="{ Component }">
              <FadeAndSlideTransitionGroup>
                <component :is="Component" :state="state" />
              </FadeAndSlideTransitionGroup>
            </template>
          </RouterView>
        </template>
      </Card>
    </div>

    <ConnectToClientDialog v-model:visible="state.showConnectionDialog" :clientWsUrlList="state.clientWsUrlList"
      :client-id="state.clientId" @reset-client-id="handleResetClientId" @update:client-id="handleConnSetClientId"
      @start-bluetooth-connect="handleStartBluetoothConnect" @start-debug-connect="handleStartDebugConnect" />
    <ClientInfoDialog v-model:visible="state.showClientInfoDialog" :client-id="state.clientId"
      :controller-url="state.apiBaseHttpUrl" :connector-type="state.connectorType"
      :b-channel-is-discrete="state.bChannelMode === 'discrete'" />
    <GetLiveCompDialog v-model:visible="state.showLiveCompDialog" :client-id="state.clientId" />
    <ConfigSavePrompt :visible="state.showConfigSavePrompt" @save="handleSaveConfig" @cancel="handleCancelSaveConfig" />
    <ConnectToSavedClientsDialog v-model:visible="state.showConnectToSavedClientsDialog"
      @confirm="handleConnSetClientId" />
    <PromptDialog v-model:visible="state.showClientNameDialog" title="保存客户端" message="将此设备保存到本地，以便于下次连接。波形列表将跟随设备保存。"
      input-label="客户端备注名" :default-value="state.newClientName" :allow-empty="false"
      @confirm="handleSaveClientConnect" />
  </div>
</template>

<style lang="scss">
@use "sass:map";

$container-max-widths: (
  md: 768px,
  lg: 960px,
  xl: 1100px,
);

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
    max-width: map.get($container-max-widths, lg);
  }
}

@media (min-width: 1024px) {
  .page-container {
    max-width: map.get($container-max-widths, xl);
  }
}

.controller-panel {
  background: #fcfcfc;
  border-radius: 0.8rem;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;

  .inner-tabs {
    --p-tabs-tablist-background: transparent;
    --p-tabs-tab-padding: 0.5rem 1.5rem;
  }
}

.controller-toolbar {
  --p-toolbar-border-radius: 0;
  border: none !important;
  border-bottom: 1px solid var(--p-content-border-color) !important;
}

.controller-page-tabs {
  background: var(--p-togglebutton-background);
  border-bottom: 1px solid var(--p-content-border-color) !important;
}

@media (prefers-color-scheme: dark) {
  .controller-panel {
    background: #121212;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  }
}
</style>
