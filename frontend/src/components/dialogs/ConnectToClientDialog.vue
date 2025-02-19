<script lang="ts" setup>
import VueQrcode from 'vue-qrcode';
import Select from 'primevue/select';
import Tabs from 'primevue/tabs';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanels from 'primevue/tabpanels';

import IconBluetooth from '../../assets/bluetooth.svg';

import { ClientConnectUrlInfo } from '../../apis/webApi';
import { CoyoteDeviceVersion } from '../../type/common';

defineOptions({
  name: 'ConnectToClientDialog',
});

const props = defineProps<{
  clientWsUrlList: ClientConnectUrlInfo[] | null;
  clientId?: string;
}>();

const visible = defineModel<boolean>('visible');

const emit = defineEmits<{
  (name: 'resetClientId'): void;
  (name: 'update:clientId', value: string): void;
  (name: 'startBluetoothConnect', version: CoyoteDeviceVersion): void;
}>();

const state = reactive({
  selectedWsUrlIndex: 0,
  selectedTab: 'dglab',

  clientIdResetting: false,

  formClientId: '',
});


const isSupportBluetooth = computed(() => {
  return 'bluetooth' in navigator;
});

const wsUrlList = computed(() => {
  return (props.clientWsUrlList?.map((item) => ({
    ...item,
    connectUrl: item.connectUrl.replace(/\{clientId\}/g, props.clientId ?? ''),
  })) ?? []).sort((a, b) => {
    if (a.domain.startsWith('192.168.')) {
      return -1;
    } else if (b.domain.startsWith('192.168.')) {
      return 1;
    } else {
      return 0;
    }
  });
});
/* error TS6133: 'handleResetClientId' is declared but its value is never read.
const handleResetClientId = async () => {
  if (state.clientIdResetting) {
    return;
  }
  if (!confirm('确定要重置客户端ID吗？')) {
    return;
  }
  state.clientIdResetting = true;
  emit('resetClientId');
};
*/

const handleSetClientId = () => {
  emit('update:clientId', state.formClientId);
};

const handleStartBluetoothConnect = (version: CoyoteDeviceVersion) => {
  emit('startBluetoothConnect', version);
};

watch(() => props.clientId, (newVal) => {
  if (newVal) {
    state.clientIdResetting = false;
  }
});
</script>

<template>
  <Dialog v-model:visible="visible" modal header="连接设备" class="mx-4 w-full md:w-[40rem]">
    <FadeAndSlideTransitionGroup>
      <div v-if="props.clientWsUrlList">
        <Tabs v-model:value="state.selectedTab">
          <TabList>
            <Tab value="dglab">连接 DG-Lab</Tab>
            <Tab value="coyoteble">蓝牙连接郊狼</Tab>
            <Tab value="clientId">通过客户端ID连接</Tab>
          </TabList>
          <TabPanels>
            <FadeAndSlideTransitionGroup>
              <div v-if="state.selectedTab === 'dglab'">
                <!-- <div class="w-full flex flex-col items-top gap-2 mb-4">
                  <label class="font-semibold">当前客户端ID</label>
                  <InputGroup>
                    <InputText :value="props.clientId" read-only></InputText>
                    <Button :icon="state.clientIdResetting ? 'pi pi-spinner pi-spin' : 'pi pi-refresh'" label="重置"
                      severity="secondary" @click="handleResetClientId" :disabled="state.clientIdResetting"></Button>
                  </InputGroup>
                  <span class="block text-sm text-gray-500">将客户端ID复制给他人，可以让他们远程连接到此设备。</span>
                  <span class="block text-sm text-gray-500">若是客户端ID泄露，可以点击“重置”按钮。</span>
                </div> -->
                <span class="block font-semibold mb-2">请使用DG-Lab扫描以下二维码：</span>
                <div class="flex justify-center mb-4 min-h-256px">
                  <VueQrcode v-if="wsUrlList[state.selectedWsUrlIndex].connectUrl"
                    :value="wsUrlList[state.selectedWsUrlIndex].connectUrl" type="image/png"
                    :color="{ dark: '#000000ff', light: '#ffffffff' }" :width="256" :height="256" />
                </div>
                <div class="w-full flex flex-col items-top gap-2">
                  <label class="font-semibold">连接地址</label>
                  <Select v-model="state.selectedWsUrlIndex"
                    :options="wsUrlList.map((item, index) => ({ value: index, label: item.domain }))"
                    optionLabel="label" optionValue="value"></Select>
                </div>
              </div>
              <div v-if="state.selectedTab === 'coyoteble'">
                <div v-if="isSupportBluetooth" class="flex flex-col items-center gap-4">
                  <Button label="连接郊狼 3.0" class="w-full" size="large"
                    @click="handleStartBluetoothConnect(CoyoteDeviceVersion.V3)">
                    <template #icon>
                      <i class="pi">
                        <IconBluetooth></IconBluetooth>
                      </i>
                    </template>
                  </Button>
                  <Button label="连接郊狼 2.0" class="w-full" size="large"
                    @click="handleStartBluetoothConnect(CoyoteDeviceVersion.V2)">
                    <template #icon>
                      <i class="pi">
                        <IconBluetooth></IconBluetooth>
                      </i>
                    </template>
                  </Button>
                </div>
                <div v-else>
                  <p class="text-red-500 font-semibold text-lg">您的浏览器不支持蓝牙连接</p>
                  <p>可以尝试使用Chrome或<a href="https://www.microsoft.com/edge/download">Edge浏览器</a></p>
                  <p>iOS设备请使用<a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055">Bluefy浏览器</a></p>
                </div>
              </div>
              <div v-if="state.selectedTab === 'clientId'">
                <div class="w-full flex flex-col items-top gap-2">
                  <Message severity="info" class="m-1">
                    <p>此功能用于连接到其他人，或者恢复连接到先前的设备。</p>
                    <p>仅支持连接相同站点的客户端。</p>
                  </Message>
                  <label class="font-semibold">客户端ID</label>
                  <InputGroup>
                    <InputText v-model="state.formClientId" placeholder="请输入目标客户端ID"></InputText>
                    <Button icon="pi pi-link" label="连接" @click="handleSetClientId"></Button>
                  </InputGroup>
                </div>
              </div>
            </FadeAndSlideTransitionGroup>
          </TabPanels>
        </Tabs>
      </div>
      <div v-else class="flex items-center justify-center h-[20rem]">
        <ProgressSpinner />
      </div>
    </FadeAndSlideTransitionGroup>
  </Dialog>
</template>

<style scoped></style>