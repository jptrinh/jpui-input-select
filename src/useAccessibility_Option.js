import { ref, inject } from 'vue';

export default function useAccessibility() {
    // DOM focus stays on the combobox (that is the point of aria-activedescendant); keeping the
    // focused option in view is handled by the options list, which also knows about the options
    // the virtual scroller has not mounted.
    const focusFromOptionId = inject('_wwSelect:focusFromOptionId', () => {});

    return {
        focusFromOptionId,
    };
}
