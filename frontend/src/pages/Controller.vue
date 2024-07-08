<script lang="ts" setup>
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';

import { CoyoteLiveGameConfig, PulseItemResponse, SocketApi } from '../apis/socketApi';
import { ClientConnectUrlInfo, ServerInfoResData, webApi } from '../apis/webApi';
import { handleApiResponse } from '../utils/response';

const CLIENT_ID_STORAGE_KEY = 'liveGameClientId';

const state = reactive({
  strengthVal: 5,
  randomStrengthVal: 5,
  strengthLimit: 20,

  randomFreqLow: 10,
  randomFreqHigh: 15,

  bChannelEnabled: false,
  bChannelMultiple: 1,

  pulseList: null as PulseItemResponse[] | null,
  currentPulseId: '',

  clientId: '',
  clientWsUrlList: null as ClientConnectUrlInfo[] | null,

  clientStatus: 'init' as 'init' | 'waiting' | 'connected',

  gameStarted: false,

  showConnectionDialog: false,
  showLiveCompDialog: false,
  showConfigSavePrompt: false,
});

// 在收到服务器的配置后设置为true，防止触发watch
let receivedConfig = false;

let oldConfig: CoyoteLiveGameConfig | null = null;

const gameConfig = computed<CoyoteLiveGameConfig>({
  get: () => {
    return {
      strength: {
        strength: state.strengthVal,
        randomStrength: state.randomStrengthVal,
        minInterval: state.randomFreqLow,
        maxInterval: state.randomFreqHigh,
        bChannelMultiplier: state.bChannelEnabled ? state.bChannelMultiple : undefined,
      },
      pulseId: state.currentPulseId,
    };
  },
  set: (value) => {
    state.strengthVal = value.strength.strength;
    state.randomStrengthVal = value.strength.randomStrength;
    state.randomFreqLow = value.strength.minInterval;
    state.randomFreqHigh = value.strength.maxInterval;
    state.bChannelEnabled = typeof value.strength.bChannelMultiplier === 'number';
    state.bChannelMultiple = value.strength.bChannelMultiplier ?? 1;
    state.currentPulseId = value.pulseId;
  }
});

const chartVal = computed(() => ({
  valLow: state.strengthVal,
  valHigh: Math.min(state.strengthVal + state.randomStrengthVal, state.strengthLimit),
  valLimit: state.strengthLimit,
}))

const randomFreq = computed({
  get: () => {
    return [state.randomFreqLow, state.randomFreqHigh];
  },
  set: (value) => {
    state.randomFreqLow = value[0];
    state.randomFreqHigh = value[1];
  },
});

const toast = useToast();

let serverInfo: ServerInfoResData;
let wsClient: SocketApi;
let dgClientConnected = false;

const initServerInfo = async () => {
  try {
    let serverInfoRes = await webApi.getServerInfo();

    handleApiResponse(serverInfoRes);

    serverInfo = serverInfoRes!;
    state.clientWsUrlList = serverInfo.server.clientWsUrls;
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
    if (state.clientId) { // 重连时重新绑定客户端
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

    toast.add({ severity: 'success', summary: '客户端连接成功', detail: '已连接到客户端', life: 3000 });
  });

  wsClient.on('clientDisconnected', () => {
    console.log('DG-Lab client disconnected');

    state.clientStatus = 'waiting';
    dgClientConnected = false;
  });

  wsClient.on('gameInitialized', () => {
    // 游戏初始化完成后，上报当前配置
    postConfig(true);
  });

  wsClient.on('gameStarted', () => {
    state.gameStarted = true;
  });

  wsClient.on('gameStopped', () => {
    state.gameStarted = false;
  });

  wsClient.on('strengthChanged', (strength) => {
    state.strengthLimit = strength.limit;
  });

  wsClient.on('configUpdated', (config) => {
    receivedConfig = true;

    if (state.showConfigSavePrompt) {
      // 当前有配置未保存，不更新配置，只替换旧配置
      oldConfig = config;
    } else {
      // 覆盖本地配置
      gameConfig.value = config;
      oldConfig = config;

      // 屏蔽保存提示
      receivedConfig = true;
      nextTick(() => {
        receivedConfig = false;
      });
    }
  });

  wsClient.connect();
};

const initClientConnection = async () => {
  try {
    let res = await webApi.getClientConnectInfo();
    handleApiResponse(res);
    state.clientId = res!.clientId;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, state.clientId);

    bindClient();
  } catch (error: any) {
    console.error('Cannot get client ws url list:', error);
    toast.add({ severity: 'error', summary: '获取客户端连接地址失败', detail: error.message });
  }
};

const bindClient = async () => {
  if (!state.clientId) return;

  try {
    state.clientStatus = 'waiting';
    let res = await wsClient.bindClient(state.clientId);
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot bind client:', error);
    toast.add({ severity: 'error', summary: '绑定客户端失败', detail: error.message });
  }
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
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);

  bindClient();

  // 关闭连接对话框
  state.showConnectionDialog = false;

  toast.add({ severity: 'success', summary: '设置成功', detail: '正在等待客户端连接', life: 3000 });
};

const setPulse = (pulseId: string) => {
  state.currentPulseId = pulseId;
};

const postConfig = async (autoPost = false) => {
  if (!dgClientConnected) {
    toast.add({ severity: 'warn', summary: '未连接到客户端', detail: '保存配置需要先连接到客户端' });
    return;
  }

  try {
    let res = await wsClient.updateConfig(gameConfig.value);
    handleApiResponse(res);

    oldConfig = gameConfig.value;

    if (!autoPost) {
      toast.add({ severity: 'success', summary: '保存成功', detail: '游戏配置已保存' });
    }
  } catch (error: any) {
    console.error('Cannot post config:', error);
  }
};

const handleStartGame = async () => {
  if (!dgClientConnected) {
    toast.add({ severity: 'warn', summary: '未连接到客户端', detail: '启动输出需要先连接到客户端' });
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
    toast.add({ severity: 'warn', summary: '未连接到客户端', detail: '暂停输出需要先连接到客户端' });
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
  if (oldConfig) {
    gameConfig.value = oldConfig;
  }

  state.showConfigSavePrompt = false;

  receivedConfig = true;
  nextTick(() => {
    receivedConfig = false;
  });
};

onMounted(async () => {
  let storedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (storedClientId) {
    state.clientId = storedClientId;
  }

  await initServerInfo();
  await initWebSocket();
});

watch(gameConfig, () => {
  if (receivedConfig) { // 收到服务器配置后不触发保存提示
    receivedConfig = false;
    return;
  }

  if (dgClientConnected) { // 已连接时才显示保存提示，未连接时会在初始化完成后自动发送配置
    state.showConfigSavePrompt = true; // 显示保存提示
  }
}, { deep: true });
</script>

<template>
  <div class="w-full page-container">
    <Toast></Toast>
    <Toast></Toast>
    <div class="flex flex-col lg:flex-row items-center lg:items-start gap-8">
      <div class="flex">
        <StatusChart v-model:val-low="chartVal.valLow" v-model:val-high="chartVal.valHigh" :val-limit="chartVal.valLimit" :running="state.gameStarted" readonly />
      </div>

      <Card class="controller-panel flex-grow-1 flex-shrink-1 w-full">
        <template #header>
          <Toolbar class="controller-toolbar">
            <template #start>
              <Button icon="pi pi-qrcode" class="mr-4" severity="secondary" label="连接DG-Lab"
                @click="showConnectionDialog()"></Button>
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
              <Button icon="pi pi-file-export" class="mr-4" severity="secondary" label="添加到OBS"
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
                <Slider class="w-full" v-model="randomFreq" range :max="60" />
              </div>
              <div class="w-40">
                <InputGroup class="input-small">
                  <InputNumber class="input-text-center" v-model="state.randomFreqLow" />
                  <InputGroupAddon>-</InputGroupAddon>
                  <InputNumber class="input-text-center" v-model="state.randomFreqHigh" />
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
          <Divider></Divider>
          <h2 class="font-bold text-xl mt-4 mb-2">波形选择</h2>
          <FadeAndSlideTransitionGroup>
            <div v-if="state.pulseList" class="grid justify-center grid-cols-3 md:grid-cols-5 gap-4">
              <ToggleButton v-for="pulseInfo in state.pulseList" class="pulse-btn"
                :model-value="state.currentPulseId === pulseInfo.id" :onLabel="pulseInfo.name"
                :offLabel="pulseInfo.name" @update:model-value="setPulse(pulseInfo.id)" onIcon="pi pi-wave-pulse"
                offIcon="pi pi-wave-pulse" />
            </div>
            <div v-else class="flex justify-center py-4">
              <ProgressSpinner />
            </div>
          </FadeAndSlideTransitionGroup>
        </template>
      </Card>
    </div>
    <ConnectToClientDialog v-model:visible="state.showConnectionDialog" :clientWsUrlList="state.clientWsUrlList" :client-id="state.clientId"
      @reset-client-id="handleResetClientId" @update:client-id="handleConnSetClientId" />
    <GetLiveCompDialog v-model:visible="state.showLiveCompDialog" :client-id="state.clientId" />
    <ConfigSavePrompt :visible="state.showConfigSavePrompt" @save="handleSaveConfig" @cancel="handleCancelSaveConfig" />
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
</style>

<style lang="scss" scoped>
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
}

.controller-toolbar {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid #e0e0e0;
}

.input-small {
  height: 32px;
  --p-inputtext-padding-y: 0.25rem;
}

.input-text-center :deep(input) {
  text-align: center;
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

.pulse-btn {
  width: 100%;
  padding: 1rem;

  :deep(.p-togglebutton-content) {
    flex-direction: column;
  }
}
</style>
