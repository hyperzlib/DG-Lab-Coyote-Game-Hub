<script lang="ts" setup>
const props = withDefaults(defineProps<{
  iconText?: string;
  strengthLimit: number;
  fluid?: boolean;
}>(), {
  iconText: '',
  fluid: false
});

const strength = defineModel<number>('strength');
const randomStrength = defineModel<number>('randomStrength');
const fireStrengthLimit = defineModel<number>('fireStrengthLimit');

defineSlots<{
  icon: () => any;
}>();

const adjustStrength = (delta: number) => {
  strength.value = Math.max(0, (strength.value ?? 0) + delta);
};

const adjustRandomStrength = (delta: number) => {
  randomStrength.value = Math.max(0, (randomStrength.value ?? 0) + delta);
};

const adjustFireStrengthLimit = (delta: number) => {
  fireStrengthLimit.value = Math.max(1, (fireStrengthLimit.value ?? 1) + delta);
};
</script>

<template>
  <Chip
    class="py-0 pl-0 w-full strength-panel"
    :class="props.fluid ? 'strength-panel-fluid' : ''"
  >
    <div class="w-full">
      <div class="flex justify-start items-center gap-3 mb-8 lg:mb-4">
        <slot name="icon">
          <div
            class="bg-primary text-primary-contrast rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <i class="pi pi-bolt"></i>
            <span class="ml-[-2px]" v-if="props.iconText">{{ props.iconText || '' }}</span>
          </div>
        </slot>
        <div class="font-semibold text-md">强度设置</div>
      </div>

      <div 
        class="strength-form-item">
        <label class="strength-form-label">基础强度</label>
        <InputGroup class="strength-form-input-group input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small"
              @click="adjustStrength(-1)" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="strength" :min="0" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small"
              @click="adjustStrength(1)" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="strength-form-item">
        <label class="strength-form-label">随机强度</label>
        <InputGroup class="strength-form-input-group input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small"
              @click="adjustRandomStrength(-1)" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="randomStrength" :min="0" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small"
              @click="adjustRandomStrength(1)" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="strength-form-item">
        <label class="strength-form-label">一键开火上限</label>
        <InputGroup class="strength-form-input-group input-group-small">
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-minus" severity="secondary" size="small"
              @click="adjustFireStrengthLimit(-1)" />
          </InputGroupAddon>
          <InputNumber class="strength-input" v-model="fireStrengthLimit" :min="1" />
          <InputGroupAddon>
            <Button class="strength-addon-button" icon="pi pi-plus" severity="secondary" size="small"
              @click="adjustFireStrengthLimit(1)" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div class="strength-form-item">
        <label class="strength-form-label">强度限制</label>
        <InputNumber class="strength-form-input-group strength-input input-small" v-model="props.strengthLimit" readonly />
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

.strength-form-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: top;
  justify-content: flex-start;
  gap: 0.5rem;
  margin-bottom: 1rem;

  @screen md {
    flex-direction: row;
  }

  @screen lg {
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 0.75rem;
  }

  .strength-form-label {
    font-weight: 600;
    width: 6em;
    margin-left: 0.25rem;
  }

  .strength-form-input-group {
    width: auto;
    max-width: 10em;
    flex: 1;
  }
}

.strength-panel-fluid {
  .strength-form-item {
    @screen lg {
      justify-content: start;
      gap: 8rem;
    }
  }
}
</style>
