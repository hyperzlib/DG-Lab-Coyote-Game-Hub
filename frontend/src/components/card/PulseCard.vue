<script lang="ts" setup>
import FireIcon from '../../assets/fire-white.svg';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { generatePulseSVG, parseCoyotePulseHex } from '../../utils/coyotePulse';

defineOptions({
    name: 'PulseCard',
});

const pulseColorLightMode = '#64748b';
const pulseColorDarkMode = '#d4d4d8';

const props = defineProps<{
    pulseInfo: any;
    isCurrentPulse: boolean;
    isFirePulse: boolean;
}>();

const emit = defineEmits<{
    setCurrentPulse: [pulseId: string];
    setFirePulse: [pulseId: string];
    renamePulse: [pulseId: string];
    deletePulse: [pulseId: string];
}>();

const menu = ref<InstanceType<typeof Menu> | null>(null);

const showMenu = (event: Event) => {
    menu.value?.toggle(event);
};

const setCurrentPulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    emit('setCurrentPulse', pulseId);
};

const setFirePulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    emit('setFirePulse', pulseId);
};

const renamePulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    emit('renamePulse', pulseId);
};

const deletePulse = () => {
    const pulseId = props.pulseInfo?.id ?? '';
    emit('deletePulse', pulseId);
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

const moreOptions = computed<any[]>(() => {
    let options: any[] = [
        {
            label: props.isFirePulse ? '开火默认波形' : '设为开火默认波形',
            icon: props.isFirePulse ? 'pi pi-check-circle' : 'pi pi-circle',
            command: () => {
                setFirePulse();
            },
        },
    ];

    if (props.pulseInfo.isCustom) { // 自定义波形
        options.push({
            label: '重命名',
            icon: 'pi pi-pencil',
            command: () => {
                renamePulse();
            },
        });

        options.push({
            label: '删除',
            icon: 'pi pi-trash',
            command: () => {
                deletePulse();
            },
        });
    }

    return options;
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
                    <div class="flex h-full gap-1 items-center flex-grow checkable" @click="setCurrentPulse()">
                        <div class="pulse-name font-semibold px-2">
                            <span>{{ props.pulseInfo.name }}</span>
                        </div>
                        <i v-if="props.pulseInfo.isCustom" class="pi pi-user" title="这是一个自定义波形"></i>
                    </div>
                    <div class="flex items-center">
                        <Transition name="fade">
                            <FireIcon class="box-content px-2 w-1em h-1em" v-if="props.isFirePulse"></FireIcon>
                        </Transition>
                        <Transition name="fade">
                            <i class="pi pi-check-circle px-2 !text-md" v-if="props.isCurrentPulse"></i>
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