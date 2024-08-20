<script lang="ts" setup>
const pillsNum = 40;
const pillWidth = 5;
const pillOffset = 4;

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

const progressToPillsWidth = (progress: number) => {
    // 计算进度条在第几个pill
    let pillIndex = Math.floor(progress * pillsNum);
    // 计算进度条在第几个pill的偏移量
    let lastPillFill = (progress * pillsNum - pillIndex) * pillWidth;

    console.log('final: ', pillIndex * (pillWidth + pillOffset) + lastPillFill);
    return pillIndex * (pillWidth + pillOffset) + lastPillFill;
}

const progressWidth = computed(() => {
    if (props.valLimit === 0) {
        return {
            valLow: 0,
            valHigh: 0,
        };
    } else {
        
        return {
            valLow: progressToPillsWidth(props.valLow / props.valLimit),
            valHigh: progressToPillsWidth(props.valHigh / props.valLimit),
        };
    }
});
</script>

<template>
    <div class="bar-chart">
        <div class="progress">
            <div
                class="progress-bar progress-bar--low"
                :style="{ width: progressWidth.valLow + 'px' }"
                role="progressbar"
                :aria-valuenow="props.valLow"
                aria-valuemin="0"
                :aria-valuemax="props.valHigh"
            ></div>
            <div
                class="progress-bar progress-bar--high"
                :style="{ width: progressWidth.valHigh + 'px' }"
                role="progressbar"
                :aria-valuenow="props.valHigh"
                aria-valuemin="0"
                :aria-valuemax="props.valHigh"
            ></div>
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
    width: 400px;
    padding: 20px;
}

.progress {
    display: flex;
    overflow: hidden;
    font-size: 0.75rem;
    background-color: #fff;
    position: relative;

    -webkit-mask-image: url('./bar1/pills-mask.svg');
    -webkit-mask-size: contain;

    mask-image: url('./bar1/pills-mask.svg');
    mask-size: contain;
    mask-repeat: repeat-x;

    --progress-height: 25px;

    width: 360px;
    height: var(--progress-height);
}

.progress-bar {
    height: var(--progress-height);
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: #fff;
    text-align: center;
    white-space: nowrap;
    background-color: #007bff;
    transition: width 0.6s ease;
    position: absolute;
    top: 0;
    left: 0;
}

.progress-bar--low {
    z-index: 1;
}

.progress-bar--high {
    background-color: #ffc107;
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