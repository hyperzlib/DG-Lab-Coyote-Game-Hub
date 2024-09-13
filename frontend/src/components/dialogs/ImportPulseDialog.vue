<script lang="ts" setup>
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { generateDGLabHexPulse, loadDGLabPulseQRCode } from '../../lib/dg-pulse-helper';
import { md5 } from 'js-md5';
import { PulseItemInfo } from '../../type/pulse';

defineOptions({
  name: 'ImportPulseDialog',
});

const visible = defineModel<boolean>('visible');

const state = reactive({
  formPulseName: '', // 波形名称

  selectedFile: null as File | null,
  selectedFileUrl: null as string | null,

  formErrors: {} as Record<string, string>,

  isProcessing: false,
});

const emit = defineEmits<{
  onPulseImported: [pulseInfo: PulseItemInfo];
}>();

const toast = useToast();

const onFileSelect = (event: any) => {
  const file: File = event.files[0];
  if (file) {
    state.selectedFile = file;

    if (state.selectedFileUrl) {
      URL.revokeObjectURL(state.selectedFileUrl);
    }
    state.selectedFileUrl = URL.createObjectURL(file);
  }
};

const validateForm = () => {
  state.formErrors = {};
  if (!state.selectedFile) {
    state.formErrors.selectedFile = '请选择一个文件';
  }
  if (!state.formPulseName) {
    state.formErrors.formPulseName = '请输入波形名称';
  }
  return Object.keys(state.formErrors).length === 0;
};

const onConfirm = async () => {
  if (!validateForm()) {
    return;
  }

  if (!state.selectedFile) {
    toast.add({ severity: 'error', summary: '错误', detail: '请选择一个文件' });
    return;
  }

  state.isProcessing = true;

  try {
    const pulseBuilderData = await loadDGLabPulseQRCode(state.selectedFile);
    const pulseHex = generateDGLabHexPulse(pulseBuilderData);
    const pulseId = md5(pulseHex.join('')).substring(0, 8);

    console.log('波形信息:', {
      id: pulseId,
      name: state.formPulseName,
      pulseData: pulseHex,
    });

    emit('onPulseImported', {
      id: pulseId,
      name: state.formPulseName,
      pulseData: pulseHex,
    });

    visible.value = false;
  } catch (error) {
    toast.add({ severity: 'error', summary: '错误', detail: '导入波形失败' });
    console.error(error);
    state.isProcessing = false;
  }
};

const onCancel = () => {
  visible.value = false;
};

watch(() => visible.value, (newVal) => {
  if (!newVal) { // 关闭对话框时重置状态
    state.isProcessing = false;
    state.formPulseName = (new Date()).toLocaleString() + ' 导入波形';
    state.selectedFile = null;
    if (state.selectedFileUrl) {
      URL.revokeObjectURL(state.selectedFileUrl);
      state.selectedFileUrl = null;
    }
  }
});
</script>

<template>
  <Dialog v-model:visible="visible" modal header="导入波形" class="dialog-importPulse mx-4 w-full md:w-[40rem]">
    <Toast />
    <div class="flex flex-col gap-4">
      <div class="w-full flex flex-col items-top gap-2 mb-4">
        <label class="font-semibold">波形名称</label>
        <InputText v-model="state.formPulseName" :invalid="!!state.formErrors.formPulseName" />
        <small v-if="state.formErrors.formPulseName" class="text-red-500">{{ state.formErrors.formPulseName }}</small>
      </div>
      <div class="flex flex-col gap-2 justify-center">
        <FileUpload mode="basic" chooseLabel="选择波形二维码" @select="onFileSelect" customUpload auto severity="secondary"
          class="p-button-outlined" :invalid="!!state.formErrors.selectedFile" />
        <small v-if="state.formErrors.selectedFile" class="text-red-500">{{ state.formErrors.selectedFile }}</small>
        <div class="w-full">
          <img v-if="state.selectedFileUrl" :src="state.selectedFileUrl" alt="波形二维码"
            class="shadow-md rounded-xl mx-auto w-auto h-[50vh]" />
        </div>
      </div>
      <div class="flex justify-end mt-4 gap-4">
        <Button label="取消" severity="secondary" @click="onCancel"></Button>
        <Button label="确定" :disabled="state.isProcessing" @click="onConfirm"></Button>
      </div>
    </div>
  </Dialog>
</template>