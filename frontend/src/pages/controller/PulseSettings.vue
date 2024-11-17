<script lang="ts" setup>
import Popover from 'primevue/popover';
import { PulseItemInfo } from '../../type/pulse';
import { ControllerPageState } from '../../pages/Controller.vue';
import { Reactive } from 'vue';
import { ToastServiceMethods } from 'primevue/toastservice';
import { ConfirmationOptions } from 'primevue/confirmationoptions';

defineOptions({
  name: 'PulseSettings',
});

const props = defineProps<{
  state: any;
}>();

// 从父组件获取state
let parentState: Reactive<ControllerPageState>;
watch(() => props.state, (value) => {
  parentState = value;
}, { immediate: true });


const customPulseList = computed(() => {
  return parentState.customPulseList.map((item) => ({
    ...item,
    isCustom: true,
  }));
});

const fullPulseList = computed(() => {
  return parentState.pulseList ? [...customPulseList.value, ...parentState.pulseList] : customPulseList.value;
});

const state = reactive({
  willRenamePulseName: '',

  showImportPulseDialog: false,
  showSortPulseDialog: false,
  showRenamePulseDialog: false,
});

const postCustomPulseConfig = inject<() => void>('postCustomPulseConfig');

const toast = inject<ToastServiceMethods>('parentToast');
const confirm = inject<{
  require: (option: ConfirmationOptions) => void;
  close: () => void;
}>('parentConfirm');

const pulseTimePopoverRef = ref<InstanceType<typeof Popover> | null>(null);

const pulseModeOptions = [
  { label: '单个', value: 'single' },
  { label: '顺序', value: 'sequence' },
  { label: '随机', value: 'random' },
];

const presetPulseTimeOptions = [
  { label: '10', value: 10 },
  { label: '30', value: 30 },
  { label: '60', value: 60 },
  { label: '120', value: 120 },
];

const handlePulseImported = async (pulseInfo: PulseItemInfo) => {
  let duplicate = parentState.customPulseList.find((item) => item.id === pulseInfo.id);
  if (duplicate) {
    toast?.add({ severity: 'warn', summary: '导入失败', detail: '相同波形已存在', life: 3000 });
    return;
  }

  parentState.customPulseList.push(pulseInfo);
  toast?.add({ severity: 'success', summary: '导入成功', detail: '波形已导入', life: 3000 });

  postCustomPulseConfig?.();
};

const togglePulse = (pulseId: string) => {
  if (parentState.pulseMode === 'single') {
    parentState.selectPulseIds = [pulseId];
  } else {
    if (parentState.selectPulseIds.includes(pulseId)) {
      parentState.selectPulseIds = parentState.selectPulseIds.filter((id) => id !== pulseId);
    } else {
      parentState.selectPulseIds.push(pulseId);
    }
  }
};

const setFirePulse = (pulseId: string) => {
  parentState.firePulseId = pulseId;
};

const showPulseTimePopover = (event: MouseEvent) => {
  pulseTimePopoverRef.value?.show(event);
};

let renamePulseId = '';
const handleRenamePulse = async (pulseId: string) => {
  renamePulseId = pulseId;
  state.willRenamePulseName = parentState.customPulseList.find((item) => item.id === pulseId)?.name ?? '';

  state.showRenamePulseDialog = true;
};

const handleRenamePulseConfirm = async (newName: string) => {
  let pulse = parentState.customPulseList.find((item) => item.id === renamePulseId);
  if (pulse) {
    pulse.name = newName;
    postCustomPulseConfig?.();
  }
};

const handleDeletePulse = async (pulseId: string) => {
  confirm?.require({
    header: '删除波形',
    message: '确定要删除此波形吗？',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: '确定',
      severity: 'danger',
    },
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      parentState.customPulseList = parentState.customPulseList.filter((item) => item.id !== pulseId);
      parentState.selectPulseIds = parentState.selectPulseIds.filter((id) => id !== pulseId);
      if (parentState.selectPulseIds.length === 0) {
        parentState.selectPulseIds = [fullPulseList.value[0].id];
      }

      postCustomPulseConfig?.();
    },
  });
};

</script>

<template>
  <div class="w-full">
    <div class="flex flex-col justify-between gap-2 mb-2 items-start md:flex-row md:items-center">
      <h2 class="font-bold text-xl">波形列表</h2>
      <div class="flex gap-2 items-center">
        <Button icon="pi pi-sort-alpha-down" title="波形排序" severity="secondary" @click="state.showSortPulseDialog = true"
          v-if="parentState.pulseMode === 'sequence'"></Button>
        <Button icon="pi pi-plus" title="导入波形" severity="secondary"
          @click="state.showImportPulseDialog = true"></Button>
        <Button icon="pi pi-clock" title="波形切换间隔" severity="secondary" :label="parentState.pulseChangeInterval + 's'"
          @click="showPulseTimePopover"></Button>
        <SelectButton v-model="parentState.pulseMode" :options="pulseModeOptions" optionLabel="label" optionValue="value"
          :allowEmpty="false" aria-labelledby="basic" />
      </div>
    </div>
    <div v-if="parentState.pulseList" class="grid justify-center grid-cols-1 md:grid-cols-2 gap-4 pb-2">
      <PulseCard v-for="pulse in fullPulseList" :key="pulse.id" :pulse-info="pulse"
        :is-current-pulse="parentState.selectPulseIds.includes(pulse.id)"
        :is-fire-pulse="pulse.id === parentState.firePulseId" @set-current-pulse="togglePulse"
        @set-fire-pulse="setFirePulse" @delete-pulse="handleDeletePulse" @rename-pulse="handleRenamePulse" />
    </div>
    <div v-else class="flex justify-center py-4">
      <ProgressSpinner />
    </div>
    <SortPulseDialog v-model:visible="state.showSortPulseDialog" :pulse-list="parentState.pulseList ?? []"
      v-model:modelValue="parentState.selectPulseIds" />
    <ImportPulseDialog v-model:visible="state.showImportPulseDialog" @on-pulse-imported="handlePulseImported" />
    <PromptDialog v-model:visible="state.showRenamePulseDialog" @confirm="handleRenamePulseConfirm" title="重命名波形"
      input-label="波形名称" :default-value="state.willRenamePulseName" />

    <Popover class="popover-pulseTime" ref="pulseTimePopoverRef">
      <div class="flex flex-col gap-4 w-[25rem]">
        <div>
          <span class="font-medium block mb-2">波形切换间隔</span>
          <div class="flex gap-2">
            <InputGroup>
              <InputNumber v-model="parentState.pulseChangeInterval" :min="5" :max="600" />
              <InputGroupAddon>秒</InputGroupAddon>
            </InputGroup>
            <SelectButton v-model="parentState.pulseChangeInterval" :options="presetPulseTimeOptions" optionLabel="label"
              optionValue="value" :allowEmpty="false" aria-labelledby="basic" />
          </div>
        </div>
      </div>
    </Popover>
  </div>
</template>