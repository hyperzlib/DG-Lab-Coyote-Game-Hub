<script lang="ts" setup>
import { useToast } from 'primevue/usetoast';
import { useClientsStore } from '../../stores/ClientsStore';
import { ConnectorType } from '../../type/common';
import { inputToClipboard } from '../../utils/utils';

defineOptions({
  name: 'ClientInfoDialog',
});

const clientsStore = useClientsStore();

const visible = defineModel<boolean>('visible');

const props = defineProps<{
  clientId: string;
  connectorType: string;
  controllerUrl: string;
}>();

const toast = useToast();

const state = reactive({
  inputClientName: '',
});

const connectorTypeStr = computed(() => {
  switch (props.connectorType) {
    case ConnectorType.DGLAB:
      return 'DGLab';
    case ConnectorType.COYOTE_BLE_V2:
    case ConnectorType.COYOTE_BLE_V3:
      return '蓝牙直连';
  }
});

const setClientName = async (name: string) => {
  clientsStore.updateClientName(props.clientId, name);
};

const gameConnectCode = computed(() => {
  if (props.controllerUrl) {
    return `${props.clientId}@${props.controllerUrl}`;
  } else {
    return props.clientId;
  }
});

const copyInput = (inputId: string) => {
  const input = document.getElementById(inputId) as HTMLInputElement;
  inputToClipboard(input);
  toast.add({ severity: 'success', summary: '提示', detail: '复制成功', life: 3000 });
};

const onKickClient = () => {
  
};

watch(() => visible.value, (value) => {
  if (value) {
    const clientInfo = clientsStore.getClientInfo(props.clientId);
    console.log(clientInfo);
    if (clientInfo) {
      state.inputClientName = clientInfo.name;
    }
  }
});

watch(() => state.inputClientName, (value) => {
  setClientName(value);
});
</script>

<template>
  <Dialog v-model:visible="visible" modal header="连接信息" class="mx-4 w-full md:w-[40rem]">
    <div class="flex items-center gap-2 mb-4">
      <label class="font-semibold w-30">游戏连接码</label>
      <InputGroup>
        <InputText :value="gameConnectCode" id="input-gameConnectCode" class="w-full" readonly />
        <Button icon="pi pi-copy" label="复制" severity="secondary" @click="copyInput('input-gameConnectCode')"></Button>
      </InputGroup>
    </div>
    <div class="flex flex-col gap-2 mb-4">
      <div class="flex items-center gap-2">
        <label class="font-semibold w-30">客户端备注名</label>
        <InputText v-model="state.inputClientName" class="w-full" />
      </div>
      <span class="text-gray-500 ml-28">客户端备注名会在每次打开页面的恢复连接窗口中显示</span>
    </div>
    <div class="flex items-center gap-2 mb-4">
      <label class="font-semibold w-30">客户端ID</label>
      <InputText :value="props.clientId" class="w-full" readonly />
    </div>
    <div class="flex items-center gap-2">
      <label class="font-semibold w-30">连接方式</label>
      <InputText :value="connectorTypeStr" class="w-full" readonly />
    </div>
    <div class="flex justify-end mt-4 gap-4">
      <Button label="断开连接" severity="danger" @click="onKickClient"></Button>
    </div>
  </Dialog>
</template>