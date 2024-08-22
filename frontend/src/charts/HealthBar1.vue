<script lang="ts" setup>
import Heart from './healthBar1/Heart.vue';
import { transitionRef } from './utils/transitionRef';

defineOptions({
    name: 'HealthBar1',
    inheritAttrs: false,
});

const props = withDefaults(defineProps<{
    valLow?: number;
    valHigh?: number;
    valLimit?: number;
    randomStrength?: number;
    running?: boolean;
    textInverted?: boolean;
    hideText?: boolean;
}>(), {
    valLow: 5,
    valHigh: 10,
    valLimit: 50,
    randomStrength: 5,
    running: false,
});

const heartNum = computed(() => {
    return Math.ceil(props.valLimit / 4); // 每个心心可以分成4份
});

const hpLow = computed(() => Math.max(0, props.valLimit - props.valHigh));
const hpHigh = computed(() => Math.max(0, props.valLimit - props.valLow));

// 通过transitionRef来实现动画效果
const hpLowAnimated = transitionRef(hpLow, 40);
const hpHighAnimated = transitionRef(hpHigh, 40);

const heartValueList = computed(() => { // 计算每个心心的红黄色值
    const heartValueList = [];
    for (let i = 0; i < heartNum.value; i++) {
        heartValueList.push({
            valRed: Math.min(100, Math.max(0, (hpLowAnimated.value - i * 4) * 100 / 4)),
            valYellow: Math.min(100, Math.max(0, (hpHighAnimated.value - i * 4) * 100 / 4)),
        });
    }
    return heartValueList;
});
</script>

<template>
    <div class="bar-chart">
        <div class="progress">
            <Heart class="heart-icon" v-for="val, i in heartValueList" :key="i" :valRed="val.valRed" :valYellow="val.valYellow" />
        </div>
        <div class="mt-2 pr-2 flex justify-between items-center value-text" :class="{ 'text-inverted': props.textInverted, 'hidden': props.hideText }">
            <div class="flex gap-2 items-center">
                <span>HP:</span><span>{{ hpHigh }}/{{ props.valLimit }}</span><span>(+{{ props.randomStrength }})</span>
            </div>
            <div>
                <svg t="1719514976614" class="icon animation-pulse" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
                    p-id="9374" style="display: block; width: 2rem; height: 2rem; margin: 0 auto" v-if="!props.running">
                    <path d="M752.113937 512.104171v383.973957h-176.04883V512.104171z" fill="#00C9CA" p-id="9375"></path>
                    <path d="M752.113937 127.921872V512.104171h-176.04883V127.921872z" fill="#00A1A2" p-id="9376"></path>
                    <path d="M447.934893 512.104171v383.973957h-175.840488V512.104171z" fill="#00C9CA" p-id="9377"></path>
                    <path d="M447.934893 127.921872V512.104171h-175.840488V127.921872z" fill="#00A1A2" p-id="9378"></path>
                </svg>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.bar-chart {
    width: 420px;
    padding: 20px;
}

.heart-icon {
    display: inline-block;
    margin-right: 6px;
}

@font-face {
    font-family: 'Joystix';
    src: url('./healthBar1/joystix.monospace-regular.otf') format('opentype');
}

.value-text {
    font-size: 1.6rem;
    font-family: 'Joystix', monospace;
    font-weight: bolder;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.text-inverted {
    color: white;
}

.hidden {
    display: none;
}
</style>