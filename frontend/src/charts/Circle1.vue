<script setup lang="ts">
defineOptions({
    name: 'Circle1',
    inheritAttrs: false,
});

const strokeDasharray = 628;

const props = withDefaults(defineProps<{
    valLow?: number;
    valHigh?: number;
    valLimit?: number;
    running?: boolean;
    darkMode?: boolean;
}>(), {
    valLow: 5,
    valHigh: 10,
    valLimit: 50,
    running: false,
});

const state = reactive({
    valLow: props.valLow,
    valHigh: props.valHigh,
    valLimit: props.valLimit,
});

const circleOffset = computed(() => {
    return {
        valLow: strokeDasharray - (strokeDasharray * (state.valLow / state.valLimit)),
        valHigh: strokeDasharray - (strokeDasharray * (state.valHigh / state.valLimit)),
    };
});

// 监听父组件传递的值变化
watch(() => [props.valLow, props.valHigh, props.valLimit], ([valLow, valHigh, valLimit]) => {
    state.valLow = valLow;
    state.valHigh = valHigh;
    state.valLimit = valLimit;
}, { immediate: true });
</script>

<template>
    <div class="progress" :class="{ dark: props.darkMode }">
        <div class="progress__number">
            <span class="strength-num color-low">{{ state.valLow }}</span>
            <span>-</span>
            <span class="strength-num color-high">{{ state.valHigh }}</span>
        </div>
        <div class="progress__number">
            <span>MAX:</span>
            <span class="strength-num color-max">{{ state.valLimit }}</span>
        </div>
        <div class="progress__icon">
            <svg t="1718546024843" class="icon animation-pulse" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
                p-id="15408" style="display: block; width: 2rem; height: 2rem; margin: 0 auto" v-if="props.running">
                <path
                    d="M341.333333 1024l76.074667-342.314667C422.528 658.773333 407.466667 640 384 640H170.666667L682.666667 0l-76.074667 342.357333c-5.12 22.912 9.941333 41.642667 33.408 41.642667h213.333333L341.333333 1024z"
                    fill="#FFA702" p-id="15409"></path>
            </svg>
            <svg t="1719514976614" class="icon animation-pulse" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
                p-id="9374" style="display: block; width: 2rem; height: 2rem; margin: 0 auto" v-else>
                <path d="M752.113937 512.104171v383.973957h-176.04883V512.104171z" fill="#00C9CA" p-id="9375"></path>
                <path d="M752.113937 127.921872V512.104171h-176.04883V127.921872z" fill="#00A1A2" p-id="9376"></path>
                <path d="M447.934893 512.104171v383.973957h-175.840488V512.104171z" fill="#00C9CA" p-id="9377"></path>
                <path d="M447.934893 127.921872V512.104171h-175.840488V127.921872z" fill="#00A1A2" p-id="9378"></path>
            </svg>
        </div>
        <svg class="progress__rings" width="256" height="256" viewBox="0 0 256 256">
            <defs>
                <linearGradient id="pc-yellow" x1="1" y1="0.5" x2="0" y2="0.5">
                    <stop offset="0%" stop-color="hsl(43,90%,55%)" />
                    <stop offset="100%" stop-color="hsl(23,90%,55%)" />
                </linearGradient>
                <linearGradient id="pc-blue" x1="1" y1="0.5" x2="0" y2="0.5">
                    <stop offset="0%" stop-color="hsl(223,90%,55%)" />
                    <stop offset="100%" stop-color="hsl(203,90%,55%)" />
                </linearGradient>
            </defs>
            <g>
                <circle class="progress__ring" cx="128" cy="128" r="100" fill="none" opacity="0.1"
                    stroke="url(#pc-yellow)" stroke-width="20" />
                <circle id="progress-max-ring" class="progress__ring-fill" data-ring="d" cx="128" cy="128" r="100"
                    fill="none" stroke="url(#pc-yellow)" stroke-width="20" stroke-linecap="round"
                    transform="rotate(-90,128,128)" :stroke-dasharray="`${strokeDasharray} ${strokeDasharray}`"
                    :stroke-dashoffset="circleOffset.valHigh" />
            </g>
            <g>
                <circle class="progress__ring" cx="128" cy="128" r="100" fill="none" opacity="0.1"
                    stroke="url(#pc-blue)" stroke-width="20" />
                <circle id="progress-min-ring" class="progress__ring-fill" data-ring="h" cx="128" cy="128" r="100"
                    fill="none" stroke="url(#pc-blue)" stroke-width="20" stroke-linecap="round"
                    transform="rotate(-90,128,128)" :stroke-dasharray="`${strokeDasharray} ${strokeDasharray}`"
                    :stroke-dashoffset="circleOffset.valLow" />
            </g>
        </svg>
    </div>
</template>

<style lang="scss" scoped>
.progress {
    display: flex;
    gap: 0.5rem;
    flex-direction: column;
    justify-content: center;
    align-content: center;
    position: relative;
    text-align: center;
    width: 16rem;
    height: 16rem;
    background-color: white;
    color: black;
    border-radius: 50%;
    box-shadow: 3px 3px 5px rgba(90, 90, 90, 0.5),
        -3px -3px 5px rgba(225, 225, 225, 0.5);
}

.progress__number,
.progress__icon {
    font-size: var(--progress-font-size);
    font-weight: bold;
    z-index: 2;
}

.progress__number {
    display: flex;
    justify-content: center;
    align-items: baseline;
    margin: 0 auto;
}

.progress__icon {
    margin: 0.3rem 0 0 0;
}

.progress__rings {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
}

.progress__ring {
    opacity: 0.1;
}

.progress__ring-fill {
    transition: opacity 0s 0.3s linear, stroke-dashoffset 0.3s ease-in-out;
}

.progress__ring-fill--360 {
    opacity: 0;
    stroke-dashoffset: 0;
    transition-duration: 0.3s;
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

.strength-num {
    font-size: var(--progress-font-size);
    font-weight: bold;
    padding: 0 0.4rem;
    min-width: 2.5rem;
}

@keyframes heartbeat {
    0% {
        transform: scale(1);
    }

    50% {
        transform: scale(1.1);
    }

    100% {
        transform: scale(1);
    }
}

@media (prefers-color-scheme: dark) {
    .progress {
        background-color: black;
        color: white;
        box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.5),
            -3px -3px 5px rgba(49, 49, 49, 0.5);
    }

    .progress__ring {
        opacity: 0.1;
    }

    .progress__ring-fill {
        transition: opacity 0s 0.3s linear, stroke-dashoffset 0.3s ease-in-out;
    }

    .progress__ring-fill--360 {
        opacity: 0;
        stroke-dashoffset: 0;
        transition-duration: 0.3s;
    }
}

.progress.dark {
    background-color: black;
    color: white;
    box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.5),
        -3px -3px 5px rgba(49, 49, 49, 0.5);

    .progress__ring {
        opacity: 0.1;
    }

    .progress__ring-fill {
        transition: opacity 0s 0.3s linear, stroke-dashoffset 0.3s ease-in-out;
    }

    .progress__ring-fill--360 {
        opacity: 0;
        stroke-dashoffset: 0;
        transition-duration: 0.3s;
    }
}
</style>
