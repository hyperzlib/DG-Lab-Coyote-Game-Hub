<script lang="ts" setup>
import VueQrcode from 'vue-qrcode';
import Select from 'primevue/select';
import Tabs from 'primevue/tabs';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanels from 'primevue/tabpanels';

import { ClientConnectUrlInfo } from '../../apis/webApi';

defineExpose({
  name: 'ConnectToClientDialog',
});

const props = defineProps<{
  clientWsUrlList: ClientConnectUrlInfo[] | null;
  clientId?: string;
}>();

const visible = defineModel('visible');

const emit = defineEmits<{
  (name: 'resetClientId'): void;
  (name: 'update:clientId', value: string): void;
}>();

const state = reactive({
  selectedWsUrlIndex: 0,
  selectedTab: 'dglab',

  clientIdResetting: false,

  formClientId: '',
});

const wsUrlList = computed(() => {
  return props.clientWsUrlList?.map((item) => ({
    ...item,
    connectUrl: item.connectUrl.replace(/\{clientId\}/g, props.clientId ?? ''),
  })) ?? [];
});

const handleResetClientId = async () => {
  if (state.clientIdResetting) {
    return;
  }
  state.clientIdResetting = true;
  emit('resetClientId');
};

const handleSetClientId = () => {
  emit('update:clientId', state.formClientId);
};

watch(() => props.clientId, (newVal) => {
  if (newVal) {
    state.clientIdResetting = false;
  }
});
</script>

<template>
  <Dialog v-model:visible="visible" modal header="连接DG-Lab" class="mx-4 w-full md:w-[40rem]">
    <FadeAndSlideTransitionGroup>
      <div v-if="props.clientWsUrlList">
        <Tabs v-model:value="state.selectedTab">
          <TabList>
            <Tab value="dglab">连接 DG-Lab</Tab>
            <Tab value="clientId">通过客户端ID连接</Tab>
          </TabList>
          <TabPanels>
            <FadeAndSlideTransitionGroup>
              <div v-if="state.selectedTab === 'dglab'">
                <div class="w-full flex flex-col items-top gap-2 mb-4">
                  <label class="font-semibold">当前客户端ID</label>
                  <InputGroup>
                    <InputText :value="props.clientId" read-only></InputText>
                    <Button :icon="state.clientIdResetting ? 'pi pi-spinner pi-spin' : 'pi pi-refresh'"
                      label="重置" severity="secondary" @click="handleResetClientId"
                      :disabled="state.clientIdResetting"></Button>
                  </InputGroup>
                  <span class="block text-sm text-gray-500">将客户端ID复制给他人，可以让他们远程连接到此设备。</span>
                  <span class="block text-sm text-gray-500">若是客户端ID泄露，可以点击“重置”按钮。</span>
                </div>
                <span class="block font-semibold mb-2">请使用DG-Lab扫描以下二维码：</span>
                <div class="flex justify-center mb-4">
                  <VueQrcode v-if="wsUrlList[state.selectedWsUrlIndex].connectUrl"
                    :value="wsUrlList[state.selectedWsUrlIndex].connectUrl" type="image/png"
                    :color="{ dark: '#000000ff', light: '#ffffffff' }" :width="256" :height="256" />
                </div>
                <div class="w-full flex flex-col items-top gap-2">
                  <label class="font-semibold">连接地址</label>
                  <Select v-model="state.selectedWsUrlIndex"
                    :options="props.clientWsUrlList.map((item, index) => ({ value: index, label: item.domain }))"
                    optionLabel="label" optionValue="value"></Select>
                </div>
              </div>
              <div v-if="state.selectedTab === 'clientId'">
                <div class="w-full flex flex-col items-top gap-2">
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