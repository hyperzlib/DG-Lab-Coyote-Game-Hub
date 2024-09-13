<script lang="ts" setup>
import { SocketApi } from './apis/socketApi';
import { ServerInfoResData, webApi } from './apis/webApi';
import { parseChartParams } from './utils/request';
import { handleApiResponse } from './utils/response';

const state = reactive({
  strength: 0,
  randomStrength: 0,
  strengthLimit: 50,

  tempStrength: 0,
  realStrength: 0,

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

const chartVal = computed(() => ({
  valLow: Math.min(state.strength + state.tempStrength, state.strengthLimit),
  valHigh: Math.min(state.strength + state.tempStrength + state.randomStrength, state.strengthLimit),
  valLimit: state.strengthLimit,
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
    state.strengthLimit = strength.limit;
    state.tempStrength = strength.tempStrength;
    state.realStrength = strength.strength;
  });

  wsClient.on('strengthConfigUpdated', (config) => {
    state.strength = config.strength;
    state.randomStrength = config.randomStrength;

    state.strength = Math.min(state.strength, state.strengthLimit); // 限制当前值不超过上限
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
          :valHigh="chartVal.valHigh" :strength="state.strength" :randomStrength="state.randomStrength"
          :tempStrength="state.tempStrength" :realStrength="state.realStrength" :strengthLimit="state.strengthLimit"
          :running="state.gameStarted" />
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