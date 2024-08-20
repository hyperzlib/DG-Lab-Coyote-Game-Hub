<script lang="ts" setup>
defineOptions({
  name: 'ConfigSavePrompt',
});

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (name: 'save'): void;
  (name: 'cancel'): void;
}>();
</script>

<template>
  <div class="fixed bottom-0 left-0 w-full">
    <Transition name="slide-up">
      <div class="toast-prompt flex items-center justify-between gap-8 rounded-lg p-4 mb-8 mx-4 md:mx-auto w-full md:w-[40rem] lg:w-[60rem]"
          v-if="props.visible">
        <p class="text-md text-white">是否保存当前配置？</p>
        <div>
          <Button size="small" severity="secondary" class="mr-4" @click="emit('save')">保存</Button>
          <Button size="small" text severity="contrast" @click="emit('cancel')">取消</Button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.toast-prompt {
  background-color: rgba(0, 0, 0, 0.8);

  // 取消按钮
  --p-button-text-primary-color: #fff;
  --p-button-text-primary-hover-background: rgba(255, 255, 255, 0.1);
  --p-button-text-primary-active-background: rgba(255, 255, 255, 0.2);
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 200ms ease-in-out, opacity 200ms linear;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translate3d(0, 20px, 0);
  opacity: 0;
}

.slide-up-enter-to, .slide-up-leave-from {
  transform: translate3d(0, 0, 0);
  opacity: 1;
}
</style>