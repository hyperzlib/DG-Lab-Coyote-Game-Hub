<script lang="ts" setup>
import Toast from 'primevue/toast';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';

import { useToast } from 'primevue/usetoast';
import { chartRoutes } from '../../charts/chartRoutes';
import { inputToClipboard } from '../../utils/utils';

defineOptions({
  name: 'GetLiveCompDialog',
});

const toast = useToast();

const props = defineProps<{
  clientId?: string;
}>();

const visible = defineModel('visible');

const state = reactive({
  theme: 'default',
  chartParams: {} as Record<string, string>,
});

const getThemeNameFromPath = (path: string) => {
  return path.replace(/^\//, '') || 'default';
}

const themeOptions = computed(() => {
  return chartRoutes.map((route) => {
    return {
      label: route.name,
      value: getThemeNameFromPath(route.path),
      params: route.meta?.params ?? [],
    };
  })
});

const buildChartParams = (params: Record<string, any>) => {
  const chartParams: Record<string, string> = {};
  for (let [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      if (value !== '') {
        chartParams[key] = value;
      }
    } else if (typeof value === 'boolean') {
      if (value) {
        chartParams[key] = 'true';
      }
    } else {
      if (value !== null && value !== undefined) {
        chartParams[key] = value.toString();
      }
    }
  }
  return chartParams;
};

const chartParamsDef = computed(() => {
  return themeOptions.value.find((theme) => theme.value === state.theme)?.params ?? [];
});

const viewerUrl = computed(() => {
  const baseUrl = location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  if (props.clientId) {
    const theme = state.theme === 'default' ? '' : state.theme;
    let url = `${baseUrl}/viewer.html?clientId=${props.clientId}#/${theme}`;
    if (Object.keys(state.chartParams).length) {
      url += '?' + new URLSearchParams(buildChartParams(state.chartParams)).toString();
    }
    return url;
  } else {
    return '';
  }
});

const urlInputRef = ref<any>(null);

const copyUrl = () => {
  if (urlInputRef.value) {
    inputToClipboard(urlInputRef.value.$el);
    toast.add({ severity: 'success', summary: '提示', detail: '复制成功', life: 3000 });
  }
};
</script>

<template>
  <Dialog v-model:visible="visible" modal header="添加到OBS" class="mx-4 w-full md:w-[40rem]">
    <Toast />
    <FadeAndSlideTransitionGroup>
      <div v-if="props.clientId">
        <!-- Preview -->
        <iframe :src="viewerUrl" class="w-full h-[20rem] mb-2"></iframe>
        <div class="flex flex-col items-start mt-4">
          <span class="block font-semibold mb-2">选择主题：</span>
          <Select
            v-model="state.theme"
            :options="themeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="请选择主题"
            class="w-full"
          ></Select>
        </div>
        <template v-for="paramDef in chartParamsDef" :key="paramDef.name">
          <div v-if="paramDef.type === 'boolean'" class="flex justify-start gap-4 items-center mt-4">
            <span class="block font-semibold">{{ paramDef.name }}：</span>
            <ToggleSwitch v-model="state.chartParams[paramDef.prop]" class="w-[4rem]"></ToggleSwitch>
          </div>
          <div v-else-if="paramDef.type === 'string'" class="flex flex-col items-start mt-4">
            <span class="block font-semibold mb-2">{{ paramDef.name }}：</span>
            <InputText v-model="state.chartParams[paramDef.prop]" class="w-full"></InputText>
          </div>
          <div v-else-if="paramDef.type === 'int' || paramDef.type === 'float'" class="flex flex-col items-start mt-4">
            <span class="block font-semibold mb-2">{{ paramDef.name }}：</span>
            <InputNumber v-if="paramDef.type === 'int'" v-model="state.chartParams[paramDef.prop]" class="w-full" showButtons></InputNumber>
            <InputNumber v-else v-model="state.chartParams[paramDef.prop]" class="w-full" showButtons :minFractionDigits="1" :maxFractionDigits="6"></InputNumber>
          </div>
          <div v-else-if="paramDef.type === 'select' && Array.isArray(paramDef.options)" class="flex flex-col items-start mt-4">
            <span class="block font-semibold mb-2">{{ paramDef.name }}：</span>
            <Select
              v-model="state.chartParams[paramDef.prop]"
              :options="paramDef.options"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            ></Select>
          </div>
        </template>
        <div class="flex flex-col items-start mt-4">
          <span class="block font-semibold mb-2">请使用以下URL添加浏览器源：</span>
          <InputGroup>
            <InputText :value="viewerUrl" class="copy-input" ref="urlInputRef" readonly></InputText>
            <Button icon="pi pi-copy" label="复制地址" severity="secondary" @click="copyUrl"></Button>
          </InputGroup>
        </div>
      </div>
      <div v-else class="flex items-center justify-center h-[20rem]">
        <ProgressSpinner />
      </div>
    </FadeAndSlideTransitionGroup>
  </Dialog>
</template>

<style scoped>
.copy-input {
  user-select: all;
  -webkit-user-select: all;
  -moz-user-select: all;
}
</style>