import { ref, nextTick, unref } from 'vue';

export default function useSearch(searchState, { updateSearch }) {
    const hasSearch = ref(false);
    const searchElement = ref(null);
    const autoFocusSearch = ref(false);

    function updateHasSearch(value) {
        hasSearch.value = value;
    }

    function updateSearchElement(value) {
        searchElement.value = value;
    }

    function focusSearch() {
        nextTick(() => {
            if (searchElement.value) {
                searchElement.value.focus();
            }
        });
    }

    function updateAutoFocusSearch(value) {
        autoFocusSearch.value = unref(value);
    }

    function resetSearch() {
        if (!searchElement.value || !searchState.value) return;

        searchElement.value.value = '';
        /*
         * Written property by property rather than as a replacement object. Spreading the state
         * would unwrap searchBy, which the search element passes as a live computed ref, freezing
         * it to whatever it held at reset time - and replacing the object also invalidates the
         * options list's filteredOptions, which feeds matches straight back into this state.
         */
        searchState.value.value = '';
        searchState.value.searchMatches = [];
    }

    return {
        hasSearch,
        autoFocusSearch,
        updateHasSearch,
        updateSearchElement,
        resetSearch,
        updateAutoFocusSearch,
        focusSearch,
    };
}
