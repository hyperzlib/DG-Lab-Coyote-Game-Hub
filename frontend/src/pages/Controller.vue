<script lang="ts" setup>
const state = reactive({
  valLow: 5,
  valHigh: 10,
  valLimit: 50,

  randomFreqLow: 10,
  randomFreqHigh: 15,

  bChannelEnabled: false,
  bChannelMultiple: 1,
});

const randomFreq = computed({
  get: () => {
    return [state.randomFreqLow, state.randomFreqHigh];
  },
  set: (value) => {
    state.randomFreqLow = value[0];
    state.randomFreqHigh = value[1];
  },
});
</script>

<template>
  <div class="w-full page-container">
    <div class="flex flex-col lg:flex-row items-center lg:items-start gap-8">
      <div class="flex">
        <StatusChart />
      </div>

      <Card class="controller-panel flex-grow-1 flex-shrink-1 w-full">
        <template #header>
          <Toolbar class="controller-toolbar">
            <template #start>
              <Button
                icon="pi pi-file-export"
                class="mr-4"
                severity="secondary"
                label="添加到OBS"
              ></Button>
              <Button
                icon="pi pi-qrcode"
                class="mr-4"
                severity="secondary"
                label="连接DG-Lab"
              ></Button>
              <span class="text-red-600 block flex items-center gap-1 mr-2">
                <i class="pi pi-circle-off"></i>
                <span>未连接</span>
              </span>
            </template>
            <template #end>
              <Button
                icon="pi pi-play"
                class="mr-2"
                severity="secondary"
                label="启动"
              ></Button>
            </template>
          </Toolbar>
        </template>

        <template #content>
          <span class="opacity-80 block mb-4">
            强度请点击仪表盘上的数字进行更改
          </span>
          <div
            class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4"
          >
            <label class="font-semibold w-30 flex-shrink-0">强度跳变频率</label>
            <div
              class="w-full flex-shrink flex gap-2 flex-col lg:items-center lg:flex-row lg:gap-8"
            >
              <div class="h-6 lg:h-auto flex-grow flex items-center">
                <Slider class="w-full" v-model="randomFreq" range :max="60" />
              </div>
              <div class="w-40">
                <InputGroup class="input-small">
                  <InputNumber
                    class="input-text-center"
                    v-model="state.randomFreqLow"
                  />
                  <InputGroupAddon>-</InputGroupAddon>
                  <InputNumber
                    class="input-text-center"
                    v-model="state.randomFreqHigh"
                  />
                </InputGroup>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 lg:gap-8 mb-4 w-full">
            <label class="font-semibold w-30">B通道</label>
            <ToggleButton
              v-model="state.bChannelEnabled"
              onIcon="pi pi-circle-on"
              onLabel="已启用"
              offIcon="pi pi-circle-off"
              offLabel="已禁用"
            />
          </div>
          <div
            class="w-full flex flex-col md:flex-row items-top lg:items-center gap-2 lg:gap-8 mb-8 lg:mb-4"
          >
            <label class="font-semibold w-30">B通道强度倍数</label>
            <InputNumber
              class="input-small"
              :disabled="!state.bChannelEnabled"
              v-model="state.bChannelMultiple"
            />
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
          <div class="grid justify-center grid-cols-3 md:grid-cols-5 gap-4">
            <ToggleButton
              v-for="i in 12"
              class="pulse-btn"
              :model-value="i === 1"
              :onLabel="`波形${i}`"
              :offLabel="`波形${i}`"
              onIcon="pi pi-wave-pulse"
              offIcon="pi pi-wave-pulse"
            />
          </div>
        </template>
      </Card>
    </div>
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
  margin: 2rem auto;
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
