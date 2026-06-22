<script lang="ts" setup>
const props = defineProps<{
  iconText?: string;
  strengthLimit: number;
}>();

const strength = defineModel<number>('strength');
const randomStrength = defineModel<number>('randomStrength');
const fireStrengthLimit = defineModel<number>('fireStrengthLimit');

const emit = defineEmits<{
  fireAction: [strength: number, duration: number],
}>();

const solt = defineSlots<{
  icon: () => any;
}>();

const state = reactive({
  localStrength: strength.value || 0,
  localRandomStrength: randomStrength.value || 0,
  localFireStrengthLimit: fireStrengthLimit.value || 0,
});
</script>

<template>
  <Chip class="py-0 pl-0 w-full strength-panel">
    <div class="w-full">
      <div class="flex justify-start items-center gap-3 mb-8 lg:mb-4">
        <slot name="icon">
          <div
            class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <i class="pi pi-bolt"></i>
            <span class="ml-[-2px]">{{ props.iconText || '' }}</span>
          </div>
        </slot>
        <div class="font-semibold text-md">强度设置</div>
      </div>

      <div class="w-full flex flex-col md:flex-row items-top lg:items-center justify-start lg:justify-between gap-2 lg:gap-8 mb-4 lg:mb-3">
        <label class="font-semibold w-[6em] ml-1">基础强度</label>
        <InputGroup class="w-auto max-w-[10em] flex-1 input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="state.localStrength" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="w-full flex flex-col md:flex-row items-top lg:items-center justify-start lg:justify-between gap-2 lg:gap-8 mb-4 lg:mb-3">
        <label class="font-semibold w-[6em] ml-1">随机强度</label>
        <InputGroup class="w-auto max-w-[10em] flex-1 input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="state.localRandomStrength" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="w-full flex flex-col md:flex-row items-top lg:items-center justify-start lg:justify-between gap-2 lg:gap-8 mb-4 lg:mb-3">
        <label class="font-semibold w-[6em] ml-1">一键开火上限</label>
        <InputGroup class="w-auto max-w-[10em] flex-1 input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="state.localFireStrengthLimit" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="w-full flex flex-col md:flex-row items-top lg:items-center justify-start lg:justify-between gap-2 lg:gap-8 mb-4 lg:mb-3">
        <label class="font-semibold w-[6em] ml-1">强度限制</label>
        <InputNumber class="w-auto max-w-[10em] flex-1 strength-input input-small" v-model="props.strengthLimit" readonly />
      </div>
      <div class="opacity-60">强度限制请在DG-Lab中设置</div>
    </div>
  </Chip>
</template>

<style lang="scss" scoped>
.strength-panel {
  --p-chip-padding-x: 0.75rem;
  --p-chip-padding-y: 0.75rem;
}

.strength-addon-button {
  --p-button-secondary-background: #fff;
  --p-button-icon-only-width: auto;
  border-width: 0;
}

.strength-input {
  :deep(input) {
    text-align: center;
    width: 100%;
  }
}
</style>