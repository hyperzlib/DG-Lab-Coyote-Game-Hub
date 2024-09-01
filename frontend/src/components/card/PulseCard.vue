<script lang="ts" setup>
import FireIcon from '../../assets/fire-white.svg';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { generatePulseSVG, parseCoyotePulseHex } from '../../utils/coyotePulse';
import { MenuItem } from 'primevue/menuitem';

defineOptions({
    name: 'PulseCard',
});

const pulseColorLightMode = '#64748b';
const pulseColorDarkMode = '#d4d4d8';

const props = defineProps<{
    pulseInfo: any;
}>();

const currentPulseId = defineModel('currentPulseId', {
    type: String,
    default: '',
});

const firePulseId = defineModel('firePulseId', {
    type: String,
    default: '',
});

const menu = ref<InstanceType<typeof Menu> | null>(null);

const showMenu = (event: Event) => {
    menu.value?.toggle(event);
};

const setCurrentPulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    currentPulseId.value = pulseId;
};

const setFirePulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    if (firePulseId.value === pulseId) {
        firePulseId.value = '';
    } else {
        firePulseId.value = pulseId;
    }
};

let prevSvgDataUrl: string | null = null;
let prevDarkSvgDataUrl: string | null = null;

const cardStyles = computed(() => {
    if (prevSvgDataUrl) {
        URL.revokeObjectURL(prevSvgDataUrl);
    }
    if (prevDarkSvgDataUrl) {
        URL.revokeObjectURL(prevDarkSvgDataUrl);
    }

    if (props.pulseInfo?.pulseData) {
        let pulseData = parseCoyotePulseHex(props.pulseInfo.pulseData);
        let svg = generatePulseSVG(pulseData);

        let lightSvg = svg.replace(/currentColor/g, pulseColorLightMode);
        let darkSvg = svg.replace(/currentColor/g, pulseColorDarkMode);

        let lightSvgBlob = new Blob([lightSvg], { type: 'image/svg+xml' });
        let lightSvgDataUrl = URL.createObjectURL(lightSvgBlob);
        prevSvgDataUrl = lightSvgDataUrl;

        let darkSvgBlob = new Blob([darkSvg], { type: 'image/svg+xml' });
        let darkSvgDataUrl = URL.createObjectURL(darkSvgBlob);
        prevDarkSvgDataUrl = darkSvgDataUrl;

        return {
            '--light-pulse-background': `url(${lightSvgDataUrl})`,
            '--dark-pulse-background': `url(${darkSvgDataUrl})`,
        };
    } else {
        return {};
    }
});

const moreOptions = computed<MenuItem[]>(() => {
    const isFirePulse = firePulseId.value === props.pulseInfo?.id;
    return [
        {
            label: isFirePulse ? '开火默认波形' : '设为开火默认波形',
            icon: isFirePulse ? 'pi pi-check' : '',
            command: () => {
                setFirePulse();
            },
        },
    ];
});

onBeforeUnmount(() => {
    if (prevSvgDataUrl) {
        URL.revokeObjectURL(prevSvgDataUrl);
    }
    if (prevDarkSvgDataUrl) {
        URL.revokeObjectURL(prevDarkSvgDataUrl);
    }
});
</script>

<template>
    <Card class="pulse-card" :style="cardStyles">
        <template #content>
            <div class="flex flex-col w-full h-full">
                <div class="flex w-full justify-between items-center">
                    <div class="flex h-full items-center flex-grow checkable" @click="setCurrentPulse()">
                        <div class="pulse-name font-semibold px-2">
                            <span>{{ props.pulseInfo.name }}</span>
                        </div>
                    </div>
                    <div class="flex items-center">
                        <Transition name="fade">
                            <FireIcon class="box-content px-2 w-1em h-1em" v-if="props.pulseInfo.id === firePulseId"></FireIcon>
                        </Transition>
                        <Transition name="fade">
                            <i class="pi pi-check-circle px-2 !text-md" v-if="props.pulseInfo.id === currentPulseId"></i>
                        </Transition>
                        <Button class="more-config-button" severity="secondary" icon="pi pi-ellipsis-h" text aria-label="更多选项" @click="showMenu"></Button>
                        <Menu ref="menu" :model="moreOptions" :popup="true"></Menu>
                    </div>
                </div>
                <div class="flex-grow checkable" @click="setCurrentPulse()"></div>
            </div>
        </template>
    </Card>
</template>

<style lang="scss" scoped>
.pulse-card {
    background-size: auto 60%;
    background-repeat: repeat-x;
    background-position: 10px bottom;

    min-height: 8rem;

    --p-card-body-padding: 0.5rem;
    --p-card-background: transparent;

    background-color: var(--p-button-secondary-background);
    background-image: var(--light-pulse-background);
    
    color: var(--p-button-secondary-color);
    
    transition: background-color 50ms linear;

    &:hover {
        background-color: var(--p-button-secondary-hover-background);
    }

    &:active {
        background-color: var(--p-button-secondary-active-background);
    }

    :deep(.p-card-body), :deep(.p-card-content) {
        height: 100%;
    }
}

.checkable {
    cursor: pointer;
}

@media (prefers-color-scheme: dark) {
    .pulse-card {
        background-image: var(--dark-pulse-background);
    }
}

// Fade Transition
.fade-enter-active, .fade-leave-active {
    transition: opacity 100ms linear;
}

.fade-enter-from, .fade-leave-to {
    opacity: 0;
}

.fade-enter-to, .fade-leave-from {
    opacity: 1;
}
</style>