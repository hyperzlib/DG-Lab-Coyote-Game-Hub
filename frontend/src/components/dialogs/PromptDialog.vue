<script lang="ts" setup>
import Dialog from 'primevue/dialog';

defineOptions({
    name: 'PromptDialog',
});

const props = withDefaults(defineProps<{
    title?: string;
    message?: string;
    defaultValue?: string;
    inputLabel?: string;
    inputType?: string;
    inputPlaceholder?: string;
    inputPattern?: string;
    inputErrorMessage?: string;
    acceptLabel?: string;
    rejectLabel?: string;
    allowEmpty?: boolean;
}>(), {
    title: '提示',
    message: '',
    inputLabel: '请输入',
    inputType: 'text',
    inputPlaceholder: '',
    inputPattern: '.*',
    inputErrorMessage: '',
    acceptLabel: '确定',
    rejectLabel: '取消',
    defaultValue: '',
    allowEmpty: true,
});

const visible = defineModel('visible');

const emit = defineEmits<{
    confirm: [value: string];
    cancel: [];
}>();

const state = reactive({
    inputValue: '',
    inputError: null as string | null,
});

const validateInput = () => {
    if (!props.allowEmpty && state.inputValue === '') {
        state.inputError = '不能为空';
        return false;
    }
    if (!new RegExp(props.inputPattern).test(state.inputValue)) {
        state.inputError = props.inputErrorMessage;
        return false;
    }
    state.inputError = null;
    return true;
};

const onConfirm = () => {
    if (!validateInput()) {
        return;
    }

    emit('confirm', state.inputValue);
    visible.value = false;
};

const onCancel = () => {
    emit('cancel');
    visible.value = false;
};

watch(() => visible.value, (newVal) => {
    if (newVal) { // reset state
        state.inputValue = props.defaultValue;
        state.inputError = null;
    }
});
</script>

<template>
    <Dialog v-model:visible="visible" modal :header="props.title" class="dialog-prompt mx-4 w-full md:w-[20rem]">
        <div class="flex flex-col gap-4">
            <div v-if="props.message">{{ props.message }}</div>
            <div class="flex flex-col items-start w-full">
                <span class="block font-semibold mb-2">{{ props.inputLabel }}</span>
                <InputText v-model="state.inputValue" class="w-full" :type="props.inputType" :placeholder="props.inputPlaceholder"
                    :class="{ 'p-invalid': state.inputError }" />
                <small class="p-error" v-if="state.inputError">{{ state.inputError }}</small>
            </div>
            <div class="flex justify-end gap-4">
                <Button :label="props.rejectLabel" severity="secondary" @click="onCancel"></Button>
                <Button :label="props.acceptLabel" @click="onConfirm"></Button>
            </div>
        </div>
    </Dialog>
</template>