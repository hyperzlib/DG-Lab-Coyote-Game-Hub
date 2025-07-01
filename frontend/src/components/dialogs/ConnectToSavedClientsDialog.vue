<script lang="ts" setup>
import ConnectToSavedClientsList from '../partials/ConnectToSavedClientsList.vue';

defineOptions({
  name: 'ConnectToSavedClientsDialog',
});

const visible = defineModel<boolean>('visible');

const emit = defineEmits<{
  cancel: [];
  confirm: [clientId: string];
}>();

const onCancel = () => {
  visible.value = false;
};

const onConnectToClient = (clientId: string) => {
  emit('confirm', clientId);
  visible.value = false;
};
</script>

<template>
  <Dialog v-model:visible="visible" modal header="连接过的设备" class="connectedToSavedClients-dialog mx-4 w-full md:w-[40rem]">
    <div class="flex flex-col gap-4">
      <ConnectToSavedClientsList @connect-to-client="onConnectToClient" />
      
      <div class="flex justify-end mt-4 gap-4">
        <Button label="连接新设备" @click="onCancel"></Button>
      </div>
    </div>
  </Dialog>
</template>

<style lang="scss">
.connectedToSavedClients-dialog {
  --p-dialog-background: var(--p-surface-50);

  @media (prefers-color-scheme: dark) {
    --p-dialog-background: var(--p-surface-950);
  }
}
</style>