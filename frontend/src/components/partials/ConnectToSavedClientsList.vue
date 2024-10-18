<script lang="ts" setup>
import { useClientsStore } from '../../stores/ClientsStore';

defineOptions({
  name: 'ConnectToSavedClientsList',
});

const clientsStore = useClientsStore();

const emit = defineEmits<{
  connectToClient: [clientId: string];
}>();

const sortedClientList = computed(() => {
  return clientsStore.clientList.sort((a, b) => b.lastConnectTime - a.lastConnectTime);
});

const connectToClient = (clientId: string) => {
  emit('connectToClient', clientId);
};
</script>

<template>
  <DataView class="clientsList-container" :value="sortedClientList">
    <template #list="slotProps">
      <div class="flex flex-col">
        <div v-for="(item, index) in slotProps.items" :key="index">
          <Card class="clientCard m-1">
            <template #content>
              <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                <div
                  class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
                  <i class="pi pi-history"></i>
                </div>
                <div class="flex flex-col md:flex-row justify-between md:items-center flex-1 gap-6">
                  <div class="flex flex-row md:flex-col justify-between items-start gap-2">
                    <div>
                      <span class="font-medium text-surface-500 dark:text-surface-400 text-sm">ID: {{ item.id }}</span>
                      <div class="text-lg font-medium">{{ item.name }}</div>
                    </div>
                  </div>
                  <div class="flex flex-col md:items-end gap-8">
                    <div class="flex flex-row-reverse md:flex-row gap-2">
                      <Button icon="pi pi-play" label="连接" class="flex-auto md:flex-initial whitespace-nowrap mr-2"
                        @click="connectToClient(item.id)"></Button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </template>
  </DataView>
</template>

<style scoped>
.clientsList-container {
  --p-dataview-content-background: var(--p-surface-50);

  height: 50vh;
  overflow-y: auto;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 6px;
  }
}

.clientCard {
  --p-card-body-padding: 1rem;
}

.bg-primary {
  background-color: var(--p-primary-color);
}

.text-primary-contrast {
  color: var(--p-primary-contrast-color);
}
</style>