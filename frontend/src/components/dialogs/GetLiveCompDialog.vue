<script lang="ts" setup>
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';

defineExpose({
  name: 'GetLiveCompDialog',
});

const toast = useToast();

const props = defineProps<{
  clientId?: string;
}>();

const visible = defineModel('visible');

const viewerUrl = computed(() => {
  const baseUrl = location.origin + import.meta.env.BASE_URL.replace(/\/$/, '');
  if (props.clientId) {
    return `${baseUrl}/viewer.html?clientId=${props.clientId}`;
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