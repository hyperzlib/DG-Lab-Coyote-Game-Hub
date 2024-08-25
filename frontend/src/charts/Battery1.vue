<script lang="ts" setup>
// Credits: https://codepen.io/clark116/pen/oNMGBW and http://a.singlediv.com/#battery
import { transitionRef } from './utils/transitionRef';

defineOptions({
    name: 'Battery1',
    inheritAttrs: false,
});

const props = withDefaults(defineProps<{
    realStrength?: number;
    strengthLimit?: number;
    valLow?: number;
    valHigh?: number;
    valLimit?: number;
    running?: boolean;
    hideText?: boolean;
    yellowBar?: boolean;
}>(), {
    realStrength: 5,
    strengthLimit: 50,
    running: false,
});

const batteryPercent = computed(() => {
    if (props.strengthLimit === 0) {
        return 0;
    } else {
        return Math.min(100, Math.round(props.realStrength * 100 / props.strengthLimit));
    }
});

const batteryPercentAnimated = transitionRef(batteryPercent, 100);

const batteryBarBackground = computed(() => {
    let gradientList: string[] = [];

    let colors = ["#316d08","#60b939", "#51aa31", "#64ce11", "#255405"];
    if (props.yellowBar) {
        colors = ["#754f00","#f2bb00", "#dbb300", "#df8f00", "#593c00"];
    }

    if (batteryPercentAnimated.value === 0) {
        gradientList.push('black 0');
        gradientList.push('black 100%');
    } else {
        gradientList.push(`${colors[0]} 0`);
        gradientList.push(`${colors[0]} 2%`);

        if (batteryPercentAnimated.value > 3) {
            gradientList.push(`${colors[1]} 3%`);
        }

        if (batteryPercentAnimated.value > 5) {
            gradientList.push(`${colors[1]} 5%`);
        }

        if (batteryPercentAnimated.value > 6) {
            gradientList.push(`${colors[2]} 6%`);
        }

        if (batteryPercentAnimated.value > 9) {
            gradientList.push(`${colors[2]} ${batteryPercentAnimated.value - 3}%`);
            gradientList.push(`${colors[3]} ${batteryPercentAnimated.value - 2}%`);
        }

        gradientList.push(`${colors[3]} ${batteryPercentAnimated.value}%`);
        gradientList.push(`${colors[4]} ${batteryPercentAnimated.value}%`);
        gradientList.push(`black ${batteryPercentAnimated.value + 5}%`);
        gradientList.push(`black 100%`);
    }

    return `linear-gradient(to right, ${gradientList.join(', ')})`;
});
</script>

<template>
    <div class="battery">
        <div class="battery-bar" :style="{ backgroundImage: batteryBarBackground }"></div>
        <div class="battery-screw"></div>
        <div class="battery-cover"></div>
        <div class="battery-electrode-container">
            <div class="battery-electrode"></div>
        </div>
    </div>
    <div class="mt-2 px-2 flex justify-between items-center value-text" v-if="!props.hideText">
        <div class="flex gap-2 items-center">
            <div class="metal-text">
                <div class="text">
                    <span>{{ props.valLow }}</span> - <span>{{ props.valHigh }}</span>
                </div>
                <div class="text-shadow">
                    <span>{{ props.valLow }}</span> - <span>{{ props.valHigh }}</span>
                </div>
            </div>

            <svg t="1719514976614" class="icon animation-pulse" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
                p-id="9374" style="display: block; width: 2rem; height: 2rem; margin: 0 auto" v-if="!props.running">
                <path d="M752.113937 512.104171v383.973957h-176.04883V512.104171z" fill="#00C9CA" p-id="9375"></path>
                <path d="M752.113937 127.921872V512.104171h-176.04883V127.921872z" fill="#00A1A2" p-id="9376"></path>
                <path d="M447.934893 512.104171v383.973957h-175.840488V512.104171z" fill="#00C9CA" p-id="9377"></path>
                <path d="M447.934893 127.921872V512.104171h-175.840488V127.921872z" fill="#00A1A2" p-id="9378"></path>
            </svg>
        </div>
        <div class="metal-text">
            <div class="text">
                MAX: <span class="color-max">{{ props.valLimit }}</span>
            </div>
            <div class="text-shadow">
                MAX: <span class="color-max">{{ props.valLimit }}</span>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.battery {
    position: relative;
    width: 250px;
    height: 120px;
    background-color: black;
    border-radius: 0.3333333;

    --progress-green: 10%;

    > .battery-bar {
        position: absolute;
        z-index: 1;
        inset: 0;
        left: 16px;
        right: 20px;
        box-sizing: border-box;
        background-image: linear-gradient(to right, #316d08 0, #316d08 2%, #60b939 3%, #60b939 5%, #51aa31 6%, #51aa31 var(--progress-green), #64ce11 calc(var(--progress-green) + 1%), #64ce11 calc(var(--progress-green) + 3%), #255405 calc(var(--progress-green) + 3%), black calc(var(--progress-green) + 8%), black 95%, transparent 95%);
    }

    > .battery-screw {
        display: block;
        position: absolute;
        z-index: 0;
        inset: 0;
        border-left: 2px solid rgba(255, 255, 255, 0.2);
        border-right: 2px solid rgba(255, 255, 255, 0.2);
        background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.4) 4%, rgba(255, 255, 255, 0.2) 7%, rgba(255, 255, 255, 0.2) 14%, rgba(255, 255, 255, 0.8) 14%, rgba(255, 255, 255, 0.2) 40%, rgba(255, 255, 255, 0) 41%, rgba(255, 255, 255, 0) 80%, rgba(255, 255, 255, 0.2) 80%, rgba(255, 255, 255, 0.4) 86%, rgba(255, 255, 255, 0.6) 90%, rgba(255, 255, 255, 0.1) 92%, rgba(255, 255, 255, 0.1) 95%, rgba(255, 255, 255, 0.5) 98%)
    }

    > .battery-cover {
        display: block;
        position: absolute;
        z-index: 2;
        width: 224px;
        height: 120px;
        left: 12px;
        top: 0;
        box-sizing: border-box;
        border-radius: 0.1666667;
        border-left: 4px solid black;
        border-right: 4px solid black;
        background-image: linear-gradient(rgba(255, 255, 255, 0.3) 4%, rgba(255, 255, 255, 0.2) 5%, transparent 5%, transparent 14%, rgba(255, 255, 255, 0.3) 14%, rgba(255, 255, 255, 0.12) 40%, rgba(0, 0, 0, 0.05) 42%, rgba(0, 0, 0, 0.05) 48%, transparent 60%, transparent 80%, rgba(255, 255, 255, 0.3) 87%, rgba(255, 255, 255, 0.3) 92%, transparent 92%, transparent 97%, rgba(255, 255, 255, 0.4) 97%), linear-gradient(to left, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.2) 2%, black 2%, black 6%, transparent 6%), linear-gradient(rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 35%, rgba(255, 255, 255, 0.3) 90%, rgba(255, 255, 255, 0) 90%);
    }

    > .battery-electrode-container {
        display: block;
        position: absolute;
        width: 12px;
        height: 55px;
        right: -12px;
        top: 32px;
        border-top-right-radius: 6px 10px;
        border-bottom-right-radius: 6px 10px;
        background-color: black;
    }

    > .battery-electrode-container > .battery-electrode {
        width: 100%;
        height: 100%;
        background-image: linear-gradient(rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 14%, rgba(255, 255, 255, 0.8) 14%, rgba(255, 255, 255, 0.3) 40%, rgba(255, 255, 255, 0) 41%, rgba(255, 255, 255, 0) 80%, rgba(255, 255, 255, 0.2) 80%, rgba(255, 255, 255, 0.4) 86%, rgba(255, 255, 255, 0.6) 90%, rgba(255, 255, 255, 0.1) 92%, rgba(255, 255, 255, 0.1) 95%, rgba(255, 255, 255, 0.5) 98%);
    }
}

.value-text {
    font-size: 1.6rem;
    font-weight: bolder;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.metal-text {
    position: relative;

    .text {
        position: relative;
        z-index: 2;
        color: transparent;
        background: linear-gradient(#7f7f7f, #eaeaea, #535353);
        background-clip: text;
        -webkit-background-clip: text;
    }

    .text-shadow {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1;
        color: #000;
        text-shadow: 1px 1px 0 #262626, 2px 2px 0 #262626, 1px 1px 0 #262626, 2px 2px 5px rgba(0, 0, 0, 0.6), 1px 1px 0 #fff;
    }
}
</style>