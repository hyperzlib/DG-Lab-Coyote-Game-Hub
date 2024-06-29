<script lang="ts" setup>
import { TransitionGroup } from 'vue';

defineExpose({
    name: 'FadeAndSlideTransitionGroup',
});

const transitionRef = ref<any | null>(null);

const onEnter = (el: Element, done: () => void) => {
    const transitionContainer = transitionRef.value!.$el as HTMLElement;
    const height = el.clientHeight;
    transitionContainer.style.height = `${height}px`;
    setTimeout(() => {
        transitionContainer.style.height = '';
    }, 300);
    done();
};

const onLeave = (el: Element, done: () => void) => {
    const transitionContainer = transitionRef.value!.$el as HTMLElement;
    const height = el.clientHeight;
    transitionContainer.style.height = `${height}px`;
    done();
};

const onAfterEnter = () => {
    // const transitionContainer = transitionRef.value!.$el as HTMLElement;
    // transitionContainer.style.height = '';
};
</script>

<template>
    <TransitionGroup name="fade-and-slide" tag="div" class="fade-and-slide" ref="transitionRef"
        @enter="onEnter" @leave="onLeave" @after-enter="onAfterEnter">
        <slot></slot>
    </TransitionGroup>
</template>

<style scoped>
.fade-and-slide {
    transition: height 250ms ease-in-out;
    overflow: hidden;
}
</style>