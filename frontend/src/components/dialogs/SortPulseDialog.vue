<script lang="ts" setup>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import OrderList from 'primevue/orderlist';

defineOptions({
  name: 'SortPulseDialog',
});

const props = defineProps<{
  pulseList: any[],
}>();

const visible = defineModel<boolean>('visible');
const modelValue = defineModel<string[]>();

const selectedPulseList = ref<{ id: string, name: string }[]>([]);

const resolveSelectedPulseList = (pulseIds: string[] = []) => {
  return pulseIds.flatMap((pulseId) => {
    const pulse = props.pulseList.find((item) => item.id === pulseId);
    return pulse ? [{ id: pulse.id, name: pulse.name }] : [];
  });
};

const onConfirm = () => {
  modelValue.value = selectedPulseList.value.map((item) => item.id);
  visible.value = false;
};

const onCancel = () => {
  selectedPulseList.value = resolveSelectedPulseList(modelValue.value);
  visible.value = false;
};

watch(() => visible.value, (newVal) => {
  if (newVal) {
    selectedPulseList.value = resolveSelectedPulseList(modelValue.value);
  }
});
</script>

<template>
  <Dialog v-model:visible="visible" modal header="波形排序" class="dialog-sortPulse mx-4 w-full md:w-[20rem]">
    <div class="flex flex-col gap-4">
      <div class="flex justify-center">
        <OrderList v-model="selectedPulseList" dataKey="id" :metaKeySelection="true">
          <template #option="{ option }">
            {{ option.name }}
          </template>
        </OrderList>
      </div>
      <div class="flex justify-end gap-4">
        <Button label="取消" severity="secondary" @click="onCancel"></Button>
        <Button label="确定" @click="onConfirm"></Button>
      </div>
    </div>
  </Dialog>
</template>

<style lang="scss">
.dialog-sortPulse {
  .p-listbox {
    width: 12rem;
  }
}
</style>
