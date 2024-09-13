<script lang="ts" setup>
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import StatusChart from '../charts/Circle1.vue';

import { GameConfigType, GameStrengthConfig, MainGameConfig, PulseItemResponse, SocketApi } from '../apis/socketApi';
import { ClientConnectUrlInfo, ServerInfoResData, webApi } from '../apis/webApi';
import { handleApiResponse } from '../utils/response';
import { simpleObjDiff } from '../utils/utils';
import Popover from 'primevue/popover';
import { PulseItemInfo } from '../type/pulse';
import { useConfirm } from 'primevue/useconfirm';

const CLIENT_ID_STORAGE_KEY = 'liveGameClientId';

const state = reactive({
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

  clientId: '',
  clientWsUrlList: null as ClientConnectUrlInfo[] | null,

  clientStatus: 'init' as 'init' | 'waiting' | 'connected',

  gameStarted: false,

  showConnectionDialog: false,
  showLiveCompDialog: false,
  showSortPulseDialog: false,
  showImportPulseDialog: false,
  showConfigSavePrompt: false,

  willRenamePulseName: '',
  showRenamePulseDialog: false,
});

const customPulseList = computed(() => {
  return state.customPulseList.map((item) => ({
    ...item,
    isCustom: true,
  }));
});

const fullPulseList = computed(() => {
  return state.pulseList ? [...customPulseList.value, ...state.pulseList] : customPulseList.value;
});

const pulseTimePopoverRef = ref<InstanceType<typeof Popover> | null>(null);

const pulseModeOptions = [
  { label: '单个', value: 'single' },
  { label: '顺序', value: 'sequence' },
  { label: '随机', value: 'random' },
];

const presetPulseTimeOptions = [
  { label: '10', value: 10 },
  { label: '30', value: 30 },
  { label: '60', value: 60 },
  { label: '120', value: 120 },
];

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

  wsClient.connect();
};

const togglePulse = (pulseId: string) => {
  if (state.pulseMode === 'single') {
    state.selectPulseIds = [pulseId];
  } else {
    if (state.selectPulseIds.includes(pulseId)) {
      state.selectPulseIds = state.selectPulseIds.filter((id) => id !== pulseId);
    } else {
      state.selectPulseIds.push(pulseId);
    }
  }
};

const setFirePulse = (pulseId: string) => {
  state.firePulseId = pulseId;
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

const showPulseTimePopover = (event: MouseEvent) => {
  pulseTimePopoverRef.value?.show(event);
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

const handlePulseImported = async (pulseInfo: PulseItemInfo) => {
  let duplicate = state.customPulseList.find((item) => item.id === pulseInfo.id);
  if (duplicate) {
    toast.add({ severity: 'warn', summary: '导入失败', detail: '相同波形已存在', life: 3000 });
    return;
  }

  state.customPulseList.push(pulseInfo);
  toast.add({ severity: 'success', summary: '导入成功', detail: '波形已导入', life: 3000 });

  await postCustomPulseConfig();
};

let renamePulseId = '';
const handleRenamePulse = async (pulseId: string) => {
  renamePulseId = pulseId;
  state.willRenamePulseName = state.customPulseList.find((item) => item.id === pulseId)?.name ?? '';

  state.showRenamePulseDialog = true;
};

const handleRenamePulseConfirm = async (newName: string) => {
  let pulse = state.customPulseList.find((item) => item.id === renamePulseId);
  if (pulse) {
    pulse.name = newName;
    await postCustomPulseConfig();
  }
};

const handleDeletePulse = async (pulseId: string) => {
  confirm.require({
    header: '删除波形',
    message: '确定要删除此波形吗？',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: '确定',
      severity: 'danger',
    },
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      state.customPulseList = state.customPulseList.filter((item) => item.id !== pulseId);
      state.selectPulseIds = state.selectPulseIds.filter((id) => id !== pulseId);
      if (state.selectPulseIds.length === 0) {
        state.selectPulseIds = [fullPulseList.value[0].id];
      }

      await postCustomPulseConfig();
    },
  });
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

onMounted(async () => {
  let storedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (storedClientId) {
    state.clientId = storedClientId;
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
    <Toast></Toast>
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
              <Button icon="pi pi-qrcode" class="mr-4" severity="secondary" label="连接控制器"
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
          <Divider></Divider>
          <div class="flex flex-col justify-between gap-2 mt-4 mb-2 items-start md:flex-row md:items-center">
            <h2 class="font-bold text-xl">波形选择</h2>
            <div class="flex gap-2 items-center">
              <Button icon="pi pi-sort-alpha-down" title="波形排序" severity="secondary"
                @click="state.showSortPulseDialog = true" v-if="state.pulseMode === 'sequence'"></Button>
              <Button icon="pi pi-upload" title="导入波形" severity="secondary"
                @click="state.showImportPulseDialog = true"></Button>
              <Button icon="pi pi-clock" title="波形切换间隔" severity="secondary" :label="state.pulseChangeInterval + 's'"
                @click="showPulseTimePopover"></Button>
              <SelectButton v-model="state.pulseMode" :options="pulseModeOptions" optionLabel="label"
                optionValue="value" :allowEmpty="false" aria-labelledby="basic" />
            </div>
          </div>
          <FadeAndSlideTransitionGroup>
            <div v-if="state.pulseList" class="grid justify-center grid-cols-1 md:grid-cols-2 gap-4 pb-2">
              <PulseCard v-for="pulse in fullPulseList" :key="pulse.id" :pulse-info="pulse"
                :is-current-pulse="state.selectPulseIds.includes(pulse.id)"
                :is-fire-pulse="pulse.id === state.firePulseId" @set-current-pulse="togglePulse"
                @set-fire-pulse="setFirePulse" @delete-pulse="handleDeletePulse" @rename-pulse="handleRenamePulse" />
            </div>
            <div v-else class="flex justify-center py-4">
              <ProgressSpinner />
            </div>
          </FadeAndSlideTransitionGroup>
        </template>
      </Card>
    </div>

    <Popover class="popover-pulseTime" ref="pulseTimePopoverRef">
      <div class="flex flex-col gap-4 w-[25rem]">
        <div>
          <span class="font-medium block mb-2">波形切换间隔</span>
          <div class="flex gap-2">
            <InputGroup>
              <InputNumber v-model="state.pulseChangeInterval" :min="5" :max="600" />
              <InputGroupAddon>秒</InputGroupAddon>
            </InputGroup>
            <SelectButton v-model="state.pulseChangeInterval" :options="presetPulseTimeOptions" optionLabel="label"
              optionValue="value" :allowEmpty="false" aria-labelledby="basic" />
          </div>
        </div>
      </div>
    </Popover>

    <ConnectToClientDialog v-model:visible="state.showConnectionDialog" :clientWsUrlList="state.clientWsUrlList"
      :client-id="state.clientId" @reset-client-id="handleResetClientId" @update:client-id="handleConnSetClientId" />
    <GetLiveCompDialog v-model:visible="state.showLiveCompDialog" :client-id="state.clientId" />
    <SortPulseDialog v-model:visible="state.showSortPulseDialog" :pulse-list="state.pulseList ?? []"
      v-model:modelValue="state.selectPulseIds" />
    <ImportPulseDialog v-model:visible="state.showImportPulseDialog" @on-pulse-imported="handlePulseImported" />
    <PromptDialog v-model:visible="state.showRenamePulseDialog" @confirm="handleRenamePulseConfirm" title="重命名波形" input-label="波形名称"
      :default-value="state.willRenamePulseName" />
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

.popover-pulseTime::before,
.popover-pulseTime::after {
  display: none;
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

.inner-tabs {
  --p-tabs-tablist-background: transparent;
  --p-tabs-tab-padding: 0.5rem 1.5rem;
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
