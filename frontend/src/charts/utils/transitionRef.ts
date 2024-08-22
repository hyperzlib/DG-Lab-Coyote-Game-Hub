export function transitionRef(value: Ref<number>, valuePerSec: number): Ref<number> {
    const refWithTransition = ref<number>(value.value);

    let transitionTimer: NodeJS.Timeout | null = null;
    let transitionTargetValue = value.value;

    const update = () => {
        if (transitionTargetValue === refWithTransition.value && transitionTimer) {
            clearInterval(transitionTimer);
            transitionTimer = null;
            return;
        } else if (transitionTargetValue > refWithTransition.value) {
            refWithTransition.value += 1;
        } else {
            refWithTransition.value -= 1;
        }
    }

    const startTransition = () => {
        if (transitionTimer) {
            return;
        }

        transitionTimer = setInterval(update, 1000 / valuePerSec);
    };

    watch(value, (newValue) => {
        transitionTargetValue = newValue;
        startTransition();
    });

    return refWithTransition;
}
