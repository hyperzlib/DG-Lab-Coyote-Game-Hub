<script lang="ts" setup>
import Heart from './healthBar1/Heart.vue';

const props = withDefaults(defineProps<{
    valLow?: number;
    valHigh?: number;
    valLimit?: number;
    readonly?: boolean;
    running?: boolean;
    darkMode?: boolean;
}>(), {
    valLow: 5,
    valHigh: 10,
    valLimit: 50,
    readonly: false,
    running: false,
});

const heartNum = computed(() => {
    return Math.ceil(props.valLimit / 4); // 每个心心可以分成4份
});

const heartValueList = computed(() => { // 计算每个心心的红黄色值
    const heartValueList = [];
    let hpLow = Math.max(0, props.valLimit - props.valHigh);
    let hpHigh = Math.max(0, props.valLimit - props.valLow);
    for (let i = 0; i < heartNum.value; i++) {
        heartValueList.push({
            valRed: Math.min(100, Math.max(0, (hpLow - i * 4) * 100 / 4)),
            valYellow: Math.min(100, Math.max(0, (hpHigh - i * 4) * 100 / 4)),
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
        <div class="mt-2 pr-2 flex justify-between items-center value-text">
            <div class="flex gap-2 items-center">
                <span class="color-low">{{ props.valLow }}</span> - <span class="color-high">{{ props.valHigh }}</span>

                <svg t="1719514976614" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
                    p-id="9374" style="display: block; width: 2rem; height: 2rem; margin: 0 auto" v-if="!props.running">
                    <path d="M752.113937 512.104171v383.973957h-176.04883V512.104171z" fill="#00C9CA" p-id="9375"></path>
                    <path d="M752.113937 127.921872V512.104171h-176.04883V127.921872z" fill="#00A1A2" p-id="9376"></path>
                    <path d="M447.934893 512.104171v383.973957h-175.840488V512.104171z" fill="#00C9CA" p-id="9377"></path>
                    <path d="M447.934893 127.921872V512.104171h-175.840488V127.921872z" fill="#00A1A2" p-id="9378"></path>
                </svg>
            </div>
            <div>
                MAX: <span class="color-max">{{ props.valLimit }}</span>
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

.value-text {
    font-size: 1.6rem;
    font-weight: bolder;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.color-low {
    color: #007bff;
}

.color-high {
    color: #ffc107;
}

.color-max {
    color: #9725f4;
}

@keyframes pulse {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }

    100% {
        opacity: 1;
    }
}

.icon {
    animation: pulse 1.5s infinite;
}
</style>