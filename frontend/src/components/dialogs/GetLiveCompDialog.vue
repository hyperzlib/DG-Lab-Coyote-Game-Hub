<script lang="ts" setup>
import Toast from 'primevue/toast';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { chartRoutes } from '../../charts/chartRoutes';

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
});

const themeOptions = computed(() => {
  return chartRoutes.map((route) => {
    return {
      label: route.name,
      value: route.path.replace(/^\//, '') || 'default',
    };
  })
});

const viewerUrl = computed(() => {
  const baseUrl = location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  if (props.clientId) {
    const theme = state.theme === 'default' ? '' : state.theme;
    return `${baseUrl}/viewer.html?clientId=${props.clientId}#/${theme}`;
  } else {
    return '';
  }
});

const urlInputRef = ref<any>(null);

const copyUrl = () => {
  if (urlInputRef.value) {
    urlInputRef.value.$el.select();
    document.execCommand('copy');
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