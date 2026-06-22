<script setup lang="ts">
defineOptions({
    name: 'Pannel1',
    inheritAttrs: false,
});

const props = withDefaults(defineProps<{
    channel?: 'A' | 'B';
    valLow?: number;
    valHigh?: number;
    valLimit?: number;
    running?: boolean;
    darkMode?: boolean;
}>(), {
    channel: 'A',
    valLow: 5,
    valHigh: 10,
    valLimit: 50,
    running: false,
});

const clampProgress = (value: number) => {
    if (props.valLimit <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, value / props.valLimit * 100));
};

const progressOffset = computed(() => ({
    valLow: 100 - clampProgress(props.valLow),
    valHigh: 100 - clampProgress(props.valHigh),
}));
</script>

<template>
    <div class="channel-panel" :class="{ dark: props.darkMode }">
        <div class="channel-panel__content" :class="{ 'channel-panel__content--with-label': props.channel === 'B' }">
            <span v-if="props.channel === 'B'" class="channel-panel__label">B通道</span>
            <div class="channel-panel__status">
                <div class="channel-panel__values">
                    <span class="strength-num color-low">{{ props.valLow }}</span>
                    <span class="value-separator">-</span>
                    <span class="strength-num color-high">{{ props.valHigh }}</span>
                </div>
                <div class="channel-panel__max">
                    <span>MAX:</span>
                    <span class="color-max">{{ props.valLimit }}</span>
                </div>
                <div class="channel-panel__icon">
                    <svg v-if="props.running" class="icon animation-pulse" viewBox="0 0 1024 1024"
                        aria-label="运行中">
                        <path
                            d="M341.333333 1024l76.074667-342.314667C422.528 658.773333 407.466667 640 384 640H170.666667L682.666667 0l-76.074667 342.357333c-5.12 22.912 9.941333 41.642667 33.408 41.642667h213.333333L341.333333 1024z"
                            fill="#FFA702" />
                    </svg>
                    <svg v-else class="icon animation-pulse" viewBox="0 0 1024 1024" aria-label="已暂停">
                        <path d="M752.113937 512.104171v383.973957h-176.04883V512.104171z"
                            fill="#00C9CA" />
                        <path d="M752.113937 127.921872V512.104171h-176.04883V127.921872z"
                            fill="#00A1A2" />
                        <path d="M447.934893 512.104171v383.973957h-175.840488V512.104171z"
                            fill="#00C9CA" />
                        <path d="M447.934893 127.921872V512.104171h-175.840488V127.921872z"
                            fill="#00A1A2" />
                    </svg>
                </div>
            </div>
        </div>

        <svg class="channel-panel__track" viewBox="0 0 256 112" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="channel-b-yellow" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stop-color="hsl(23,90%,55%)" />
                    <stop offset="100%" stop-color="hsl(43,90%,55%)" />
                </linearGradient>
                <linearGradient id="channel-b-blue" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stop-color="hsl(203,90%,55%)" />
                    <stop offset="100%" stop-color="hsl(223,90%,55%)" />
                </linearGradient>
            </defs>

            <path class="track-base track-base--high" pathLength="100"
                d="M 28 98 H 232 A 10 10 0 0 0 242 88 V 28" />
            <path class="track-base track-base--low" pathLength="100"
                d="M 28 98 H 232 A 10 10 0 0 0 242 88 V 28" />
            <path class="track-fill track-fill--high" pathLength="100"
                d="M 28 98 H 232 A 10 10 0 0 0 242 88 V 28"
                :stroke-dashoffset="progressOffset.valHigh" />
            <path class="track-fill track-fill--low" pathLength="100"
                d="M 28 98 H 232 A 10 10 0 0 0 242 88 V 28"
                :stroke-dashoffset="progressOffset.valLow" />
        </svg>
    </div>
</template>

<style scoped lang="scss">
.channel-panel {
    position: relative;
    width: 16rem;
    height: 7rem;
    overflow: hidden;
    color: black;
    background-color: white;
    border-radius: 1.5rem;
    box-shadow:
        3px 3px 5px rgba(90, 90, 90, 0.5),
        -3px -3px 5px rgba(225, 225, 225, 0.5);
}

.channel-panel__content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 1.55rem 2.35rem 1.4rem 1.4rem;
}

.channel-panel__content--with-label {
    padding-top: 0.85rem;
}

.channel-panel__label {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    opacity: 0.48;
}

.channel-panel__status {
    display: flex;
    align-items: baseline;
    width: 100%;
    margin-top: 0.15rem;
    font-weight: bold;
}

.channel-panel__values {
    display: flex;
    flex-shrink: 0;
    align-items: baseline;
    font-size: 1.65rem;
}

.strength-num {
    min-width: 2rem;
    text-align: center;
}

.value-separator {
    margin: 0 0.05rem;
    opacity: 0.7;
}

.channel-panel__max {
    display: flex;
    flex-shrink: 0;
    gap: 0.3rem;
    align-items: baseline;
    margin-left: 0.7rem;
    font-size: 0.82rem;
}

.channel-panel__icon {
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    margin-left: auto;
    align-self: center;
}

.icon {
    display: block;
    width: 100%;
    height: 100%;
}

.channel-panel__track {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
}

.track-base,
.track-fill {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.track-base {
    opacity: 0.1;
}

.track-base--high,
.track-fill--high {
    stroke: url("#channel-b-yellow");
}

.track-base--low,
.track-fill--low {
    stroke: url("#channel-b-blue");
}

.track-fill {
    stroke-dasharray: 100 100;
    transition: stroke-dashoffset 0.3s ease-in-out;
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

@media (prefers-color-scheme: dark) {
    .channel-panel {
        color: white;
        background-color: black;
        box-shadow:
            3px 3px 5px rgba(0, 0, 0, 0.5),
            -3px -3px 5px rgba(49, 49, 49, 0.5);
    }
}

.channel-panel.dark {
    color: white;
    background-color: black;
    box-shadow:
        3px 3px 5px rgba(0, 0, 0, 0.5),
        -3px -3px 5px rgba(49, 49, 49, 0.5);
}
</style>
