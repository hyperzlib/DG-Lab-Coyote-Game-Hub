<script lang="ts" setup>
defineOptions({
  name: 'FadeAndSlideTransitionGroup',
});

const transitionRef = ref<any | null>(null);

const onEnter = (el: Element, done: () => void) => {
  console.log('onEnter');
  const transitionContainer = transitionRef.value!.$el as HTMLElement;
  const transitionEl = el as HTMLElement;
  let prevHeight = el.clientHeight;
  transitionContainer.style.height = `${prevHeight}px`;
  transitionEl.style.visibility = 'hidden';

  let timer = setInterval(() => {
    const height = el.clientHeight;
    if (height !== prevHeight) {
      transitionContainer.style.height = `${height}px`;
      prevHeight = height;
    }
  }, 100);

  setTimeout(() => {
    // 与onLeave的duration保持一致
    transitionEl.style.visibility = '';
    transitionContainer.style.opacity = '1';
  }, 150);

  setTimeout(() => {
    clearInterval(timer);
    transitionContainer.style.height = '';
    transitionContainer.style.opacity = '';
    done();
  }, 400);
};

const onLeave = (el: Element, done: () => void) => {
  console.log('onLeave');
  const transitionContainer = transitionRef.value!.$el as HTMLElement;
  const height = el.clientHeight;
  transitionContainer.style.height = `${height}px`;
  transitionContainer.style.opacity = '0';

  setTimeout(() => {
    console.log('onLeave done');
    done();
  }, 150);
};

const onAfterEnter = () => {
  // const transitionContainer = transitionRef.value!.$el as HTMLElement;
  // transitionContainer.style.height = '';
};
</script>

<template>
  <TransitionGroup name="fade-and-slide" tag="div" class="fade-and-slide" ref="transitionRef" @enter="onEnter"
    @leave="onLeave" @after-enter="onAfterEnter" mode="out-in">
    <slot></slot>
  </TransitionGroup>
</template>

<style scoped>
.fade-and-slide {
  transition: height 250ms ease-in-out, opacity 100ms linear;
  opacity: 1;
  overflow: hidden;
}
</style>