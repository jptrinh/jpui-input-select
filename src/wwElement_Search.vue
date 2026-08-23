<template>
    <input
        ref="searchElementRef"
        name="select-search"
        :style="[searchStyles]"
        :class="['ww-select-search']"
        @input="handleInputChange"
        @keydown="handleKeydown"
        @focus="handleSearchFocus"
        @blur="handleSearchBlur"
        :placeholder="searchPlaceholder"
    />
</template>

<script>
import { inject, onMounted, onBeforeUnmount, ref, computed, watch, nextTick } from 'vue';
/* wwEditor:start */
import useEditorHint from './editor/useEditorHint';
/* wwEditor:end */
import { debounce } from './utils';

export default {
    props: {
        content: { type: Object, required: true },
        /* wwEditor:start */
        wwEditorState: { type: Object, required: true },
        /* wwEditor:end */
        wwElementState: { type: Object, required: true },
    },
    emits: ['element-event', 'trigger-event', 'update:sidepanel-content'],
    setup(props, { emit }) {
        /* wwEditor:start */
        useEditorHint(emit);
        /* wwEditor:end */
        const {
            updateHasSearch,
            updateSearchElement,
            updateSearch,
            autoFocusSearch,
            focusSearch,
            isSearchBarFocused,
            handleKeydown,
            handleFocusLeave,
        } = inject('_wwSelect:useSearch', {});
        const isMouseDownOnOption = inject('_wwSelect:isMouseDownOnOption', ref(false));
        const searchElementRef = ref(null);
        const searchElement = computed(() => searchElementRef.value);
        const searchBy = computed(() => {
            return (props.content.searchBy || [])
                .filter(item => item && item.filter)
                .flatMap(item => {
                    try {
                        return JSON.parse(item.filter.replace(/'/g, '"'));
                    } catch (e) {
                        // This runs inside a computed: one malformed entry must not take the
                        // render down, it just contributes no field to search on.
                        return [];
                    }
                });
        });

        const debouncedUpdateSearch = debounce((value, searchBy) => {
            if (updateSearch) updateSearch({ value, searchBy });
        }, 300);

        const searchStyles = computed(() => {
            const borderCss = !props.content.searchBorder
                ? {
                      border: props.content.searchBorderAll,
                  }
                : {
                      'border-top': props.content.searchBorderTop,
                      'border-right': props.content.searchBorderRight,
                      'border-bottom': props.content.searchBorderBottom,
                      'border-left': props.content.searchBorderLeft,
                  };

            return {
                width: props.content.searchWidth,
                height: props.content.searchHeight,
                'border-radius': props.content.searchBorderRadius,
                padding: props.content.searchPadding,
                margin: props.content.searchMargin,
                'background-color': props.content.searchBgColor,
                'font-family': props.content.searchFontFamily,
                'font-size': props.content.searchFontSize,
                'font-weight': props.content.searchFontWeight,
                color: props.content.searchFontColor,
                '--placeholder-color': props.content.searchPlaceholderColor,
                outline: props.content.searchOutline,
                'outline-offset': props.content.searchOutlineOffset,
                cursor: 'text',
                ...borderCss,
            };
        });

        const searchPlaceholder = computed(() => {
            return wwLib.wwLang.getText(props.content.searchPlaceholder);
        });

        // This event come from ww-input-basic => https://github.com/weweb-assets/ww-input-basic
        const handleInputChange = event => {
            debouncedUpdateSearch(event?.target?.value, searchBy);
        };

        const handleSearchFocus = () => {
            isSearchBarFocused.value = true;
        };

        const handleSearchBlur = event => {
            isSearchBarFocused.value = false;
            if (!isMouseDownOnOption.value && handleFocusLeave) handleFocusLeave(event.relatedTarget);
        };

        watch(searchElement, value => {
            if (updateSearchElement) updateSearchElement(value);
        });

        onMounted(() => {
            if (updateHasSearch) updateHasSearch(true);
            if (updateSearch) updateSearch({ value: '', searchBy, searchMatches: [] });
        });

        onBeforeUnmount(() => {
            if (updateHasSearch) updateHasSearch(false);
        });

        return {
            searchElementRef,
            handleInputChange,
            handleSearchFocus,
            handleSearchBlur,
            handleKeydown,
            searchStyles,
            searchPlaceholder,
        };
    },
};
</script>

<style scoped lang="scss">
.ww-select-search {
    &::placeholder {
        color: var(--placeholder-color);
    }
}
</style>
