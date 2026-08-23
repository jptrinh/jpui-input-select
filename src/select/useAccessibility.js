import { ref, provide, watch } from 'vue';
import { areValuesEqual } from '../utils';

export default function useAccessibility({
    elementRef,
    options,
    isOpen,
    methods: { openDropdown, closeDropdown, toggleValue },
}) {
    const dropdownId = `ww-select-dropdown-${wwLib.wwUtils.getUid()}`;

    const activeDescendant = ref('');
    const focusedOptionIndex = ref(0);
    const activeOptionValue = ref('');

    const updateFocusedOption = index => {
        const focusedOption = options.value[index];
        if (!focusedOption) {
            resetFocus();
            return;
        }
        focusedOptionIndex.value = index;
        activeOptionValue.value = focusedOption.value;
        activeDescendant.value = focusedOption.optionId;
    };

    const focusFromOptionId = optionId => {
        if (!optionId) {
            resetFocus();
            return;
        }

        const index = options.value.findIndex(option => option.optionId === optionId);
        if (index === -1) {
            resetFocus();
            return;
        }
        updateFocusedOption(index);
    };

    const resetFocus = () => {
        activeDescendant.value = '';
        focusedOptionIndex.value = 0;
        activeOptionValue.value = '';
    };

    const focusSelectElement = () => {
        elementRef.value?.focus();
    };

    /*
     * The options list is recomputed on every selection change, so keep the current focus where it
     * is when the focused option is still in the list. Only when it disappears (search, new data)
     * do we fall back to the selected option, which is what should be focused when the list first
     * appears.
     */
    watch(
        options,
        () => {
            // Followed by value, not by id: ids are positional, so the focused id still exists in
            // a re-filtered list of the same length while pointing at an unrelated option.
            const focusedIndex = activeDescendant.value
                ? options.value.findIndex(option => areValuesEqual(option.value, activeOptionValue.value))
                : -1;

            if (focusedIndex !== -1) {
                updateFocusedOption(focusedIndex);
                return;
            }

            resetFocus();

            const selectedIndex = options.value.findIndex(option => option.isSelected);
            if (selectedIndex !== -1) updateFocusedOption(selectedIndex);
        },
        { immediate: true }
    );

    const navigateOptions = direction => {
        const optionsCount = options.value.length;
        if (optionsCount === 0) return;

        let newIndex;
        if (!isOpen.value) {
            newIndex = 0;
        } else if (activeDescendant.value === '') {
            newIndex = direction > 0 ? 0 : optionsCount - 1;
        } else {
            newIndex = (focusedOptionIndex.value + direction + optionsCount) % optionsCount;
        }

        updateFocusedOption(newIndex);
    };

    const handleKeydown = event => {
        const keyHandlers = {
            Tab: () => {
                if (isOpen.value) {
                    closeDropdown();
                    if (event.shiftKey) {
                        elementRef.value.tabIndex = -1;
                        setTimeout(() => {
                            if (elementRef.value) elementRef.value.tabIndex = 0;
                        }, 0);
                    }
                }
            },
            ArrowDown: () => {
                event.preventDefault();
                !isOpen.value ? openDropdown() : navigateOptions(1);
            },
            ArrowUp: () => {
                event.preventDefault();
                !isOpen.value ? openDropdown() : navigateOptions(-1);
            },
            ' ': () => {
                if (!isOpen.value) {
                    event.preventDefault();
                    openDropdown();
                }
            },
            Enter: () => {
                event.preventDefault();
                // Gated on the focused id, not on its value: an option is allowed to be worth
                // '', 0 or null, and only the id tells us whether anything is focused at all.
                if (isOpen.value && activeDescendant.value) {
                    toggleValue(activeOptionValue.value);
                    // Restore focus to trigger after selection so focus-visible state is preserved.
                    // setTimeout(0) ensures this runs after any nextTick-scheduled option focus calls.
                    setTimeout(() => focusSelectElement(), 0);
                } else if (!isOpen.value) {
                    openDropdown();
                }
            },
            Escape: () => {
                event.preventDefault();
                if (isOpen.value) {
                    closeDropdown();
                    resetFocus();
                }
            },
        };

        const handler = keyHandlers[event.key];
        if (handler) handler();
    };

    const setInitialFocus = value => {
        const selectedIndex = options.value.findIndex(option => areValuesEqual(option.value, value));
        if (selectedIndex !== -1) {
            updateFocusedOption(selectedIndex);
        }
    };

    provide('_wwSelect:activeDescendant', activeDescendant);
    provide('_wwSelect:focusedOptionIndex', focusedOptionIndex);
    provide('_wwSelect:setInitialFocus', setInitialFocus);
    provide('_wwSelect:focusFromOptionId', focusFromOptionId);
    provide('_wwSelect:focusSelectElement', focusSelectElement);

    return {
        dropdownId,
        activeDescendant,
        handleKeydown,
        resetFocus,
        setInitialFocus,
    };
}
