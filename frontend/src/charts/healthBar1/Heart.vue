<script lang="ts" setup>
defineOptions({
  name: 'Heart',
});

const props = withDefaults(defineProps<{
    valRed?: number;
    valYellow?: number;
}>(), {
    valRed: 0,
    valYellow: 0,
});
</script>

<template>
    <div class="heart">
        <div class="heart__progress heart__progress-red" :style="{ '--progress': props.valRed }"></div>
        <div class="heart__progress heart__progress-yellow" :style="{ '--progress': props.valYellow }"></div>
    </div>
</template>

<style scoped>
.heart {
    width: 2rem;
    height: 2rem;
    
    position: relative;

    background-color: rgba(0, 0, 0, 0.2);

    -webkit-mask-image: url('./heart-mask.svg');
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;

    mask-image: url('./heart-mask.svg');
    mask-size: contain;
    mask-repeat: no-repeat;
}

.heart__progress {
    position: absolute;
    
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;

    --progress: 100;

    --heart-color: #c02b0e;

    background: conic-gradient(
        transparent 0% calc(100% - var(--progress) * 1%),
        var(--heart-color) calc(100% - var(--progress) * 1%) 100%
    );

    transition: background 0.2s ease;
}

.heart__progress-red {
    --heart-color: #c02b0e;
    z-index: 2;
}

.heart__progress-yellow {
    --heart-color: #f0ad4e;
    z-index: 1;
}
</style>