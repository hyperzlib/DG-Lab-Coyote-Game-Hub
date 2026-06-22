<script lang="ts" setup>
import { SocketApi } from './apis/socketApi';
import { ServerInfoResData, webApi } from './apis/webApi';
import { parseChartParams } from './utils/request';
import { handleApiResponse } from './utils/response';

type ViewerChannelState = {
  strength: number;
  randomStrength: number;
  strengthLimit: number;
  tempStrength: number;
  realStrength: number;
};

const state = reactive({
  channels: {
    main: {
      strength: 0,
      randomStrength: 0,
      strengthLimit: 50,
      tempStrength: 0,
      realStrength: 0,
    },
    channelB: {
      strength: 0,
      randomStrength: 0,
      strengthLimit: 50,
      tempStrength: 0,
      realStrength: 0,
    },
  } as Record<'main' | 'channelB', ViewerChannelState>,

  clientId: '',

  gameStarted: false,

  error: null as string | null,
});

let serverInfo: ServerInfoResData;
let wsClient: SocketApi;

const route = useRoute();

const chartParams = computed(() => {
  return parseChartParams(route);
});

const channel = computed<'A' | 'B'>(() => route.query.channel === 'B' ? 'B' : 'A');
const channelKey = computed<'main' | 'channelB'>(() => channel.value === 'B' ? 'channelB' : 'main');
const channelState = computed(() => state.channels[channelKey.value]);

const chartVal = computed(() => ({
  valLow: Math.min(channelState.value.strength + channelState.value.tempStrength, channelState.value.strengthLimit),
  valHigh: Math.min(
    channelState.value.strength + channelState.value.tempStrength + channelState.value.randomStrength,
    channelState.value.strengthLimit,
  ),
  valLimit: channelState.value.strengthLimit,
}));

const initServerInfo = async () => {
  try {
    let serverInfoRes = await webApi.getServerInfo();
    handleApiResponse(serverInfoRes);
    serverInfo = serverInfoRes!;
  } catch (error: any) {
    console.error('Cannot get server info:', error);
    state.error = '无法获取服务器信息';
  }
};

const initWebSocket = async () => {
  wsClient = new SocketApi(serverInfo.server.wsUrl);

  wsClient.on('open', () => {
    // 此事件在重连时也会触发
    console.log('WebSocket connected or re-connected');
    if (state.clientId) { // 重连时重新绑定客户端
      bindClient();
    }
  });

  wsClient.on('strengthChanged', (strength) => {
    for (const key of ['main', 'channelB'] as const) {
      state.channels[key].strengthLimit = strength[key].limit;
      state.channels[key].tempStrength = strength[key].tempStrength;
      state.channels[key].realStrength = strength[key].strength;
    }
  });

  wsClient.on('strengthConfigUpdated', (config) => {
    for (const key of ['main', 'channelB'] as const) {
      state.channels[key].strength = Math.min(config[key].strength, state.channels[key].strengthLimit);
      state.channels[key].randomStrength = config[key].randomStrength;
    }
  });

  wsClient.on('gameStarted', () => {
    state.gameStarted = true;
  });

  wsClient.on('gameStopped', () => {
    state.gameStarted = false;
  });

  wsClient.connect();
};

const bindClient = async () => {
  try {
    let res = await wsClient.bindClient(state.clientId);
    handleApiResponse(res);
  } catch (error: any) {
    console.error('Cannot bind client:', error);
    state.error = '绑定客户端失败' + error.message;
  }
};

onBeforeUnmount(() => {
  wsClient.close();
});

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('clientId')) {
    state.error = '缺少 clientId 参数';
    return;
  }

  state.clientId = urlParams.get('clientId')!;

  await initServerInfo();
  await initWebSocket();
});
</script>

<template>
  <div class="w-full h-full">
    <RouterView>
      <template #default="{ Component }">
        <Component :is="Component" v-bind="chartParams" :valLimit="chartVal.valLimit" :valLow="chartVal.valLow"
          :valHigh="chartVal.valHigh" :strength="channelState.strength"
          :randomStrength="channelState.randomStrength" :tempStrength="channelState.tempStrength"
          :realStrength="channelState.realStrength" :strengthLimit="channelState.strengthLimit"
          :running="state.gameStarted" :channel="channel" />
      </template>
    </RouterView>
    <Transition name="fade">
      <div class="fixed w-full h-full left-0 top-0 error-cover" v-if="state.error">
        <div class="flex flex-col items-center justify-center h-full">
          <p class="text-xl font-semibold text-white">{{ state.error }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
body {
  background-color: transparent;
  height: 100vh;
  display: grid;
  place-items: center;
}

.error-cover {
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  z-index: 20;
  text-shadow: 0 0 5px black;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave {
  opacity: 1;
}
</style>
