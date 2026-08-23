<template>
    <!-- Heavy Mode: RecycleScroller for better performance with large lists -->
    <RecycleScroller
        v-if="heavyMode && filteredOptions.length > 0"
        ref="recycleScrollerRef"
        class="scroller"
        :style="scrollerStyle"
        :items="dynamicScrollerItems"
        :item-size="itemSize"
        :buffer="virtualScrollBuffer"
        :key="'heavy-' + filteredOptions.length"
        key-field="id"
    >
        <template v-slot="{ item, index }">
            <wwLayoutItemContext :key="index" is-repeat :index="index" :data="item">
                <div :style="index != filteredOptions.length - 1 ? { paddingBottom: content.optionSpacing } : {}">
                    <ww-element-option
                        :local-data="item"
                        :index="index"
                        :content="content"
                        :wwEditorState="wwEditorState"
                    />
                </div>
            </wwLayoutItemContext>
        </template>
    </RecycleScroller>

    <!-- Normal Mode: DynamicScroller with automatic size detection -->
    <DynamicScroller
        v-else-if="!heavyMode && filteredOptions.length > 0"
        ref="dynamicScrollerRef"
        class="scroller"
        :style="scrollerStyle"
        :items="dynamicScrollerItems"
        :min-item-size="virtualScrollMinItemSize"
        :buffer="virtualScrollBuffer"
        :key="'dynamic-' + filteredOptions.length"
    >
        <template v-slot="{ item, index, active }">
            <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="JSON.stringify(item)"
                :data-index="index"
            >
                <wwLayoutItemContext :key="index" is-repeat :index="index" :data="item">
                    <div :style="index != filteredOptions.length - 1 ? { paddingBottom: content.optionSpacing } : {}">
                        <ww-element-option
                            :local-data="item"
                            :index="index"
                            :content="content"
                            :wwEditorState="wwEditorState"
                        />
                    </div>
                </wwLayoutItemContext>
            </DynamicScrollerItem>
        </template>
    </DynamicScroller>

    <div v-show="filteredOptions.length === 0 || showEmptyStateInEditor" :style="emptyStateStyle">
        <span>{{ emptyStateText }}</span>
    </div>
</template>

<script>
import InputSelectOption from './wwElement_Option.vue';
import { ref, inject, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller';
import { useMemoize } from '@vueuse/core';
/* wwEditor:start */
import useEditorHint from './editor/useEditorHint';
/* wwEditor:end */

export default {
    components: {
        DynamicScroller,
        DynamicScrollerItem,
        RecycleScroller,
        'ww-element-option': InputSelectOption,
    },
    props: {
        content: { type: Object, required: true },
        /* wwEditor:start */
        wwEditorState: { type: Object, required: true },
        /* wwEditor:end */
        wwElementState: { type: Object, required: true },
    },
    emits: ['update:sidepanel-content'],
    setup(props, { emit }) {
        /* wwEditor:start */
        useEditorHint(emit);
        /* wwEditor:end */

        const isEditing = computed(() => {
            /* wwEditor:start */
            return props.wwEditorState.isEditing;
            /* wwEditor:end */
            // eslint-disable-next-line no-unreachable
            return false;
        });

        const showEmptyStateInEditor = computed(() => {
            /* wwEditor:start */
            return props.wwEditorState.sidepanelContent.showEmptyStateInEditor && props.wwEditorState.isEditing;
            /* wwEditor:end */
            // eslint-disable-next-line no-unreachable
            return false;
        });

        const rawData = inject('_wwSelect:rawData', ref([]));
        const searchState = inject('_wwSelect:searchState', ref(null));
        const { updateSearch } = inject('_wwSelect:useSearch', {});
        const registerOptionProperties = inject('_wwSelect:registerOptionProperties', () => {});
        const registerFilteredOptions = inject('_wwSelect:registerFilteredOptions', () => {});
        const activeDescendant = inject('_wwSelect:activeDescendant', ref(''));
        const focusedOptionIndex = inject('_wwSelect:focusedOptionIndex', ref(0));
        const recycleScrollerRef = ref(null);
        const dynamicScrollerRef = ref(null);
        const virtualScrollMinItemSize = computed(() => props.content.virtualScrollMinItemSize);
        const virtualScrollBuffer = computed(() => props.content.virtualScrollBuffer);
        const heavyMode = computed(() => props.content.heavyMode);
        const itemSize = computed(() => props.content.itemSize);

        const emptyStateText = computed(() => wwLib.wwLang.getText(props.content.emptyStateText));

        const options = computed(() => {
            const items = rawData.value;
            return Array.isArray(items) ? items : [];
        });

        const optionProperties = computed(() => {
            if (!options.value || options.value.length === 0) return {};
            return options.value[0];
        });

        const memoizedFilter = useMemoize((options, filterValue) => {
            return options.filter(option => {
                // Handle primitive values directly
                const isPrimitive = typeof option !== 'object' || option === null;
                if (isPrimitive) {
                    const normalizedOption = option
                        .toString()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                    const normalizedFilter = filterValue
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase();
                    return normalizedOption.includes(normalizedFilter);
                } else {
                    // For objects, use the existing search logic
                    const searchBy = searchState.value?.searchBy?.length
                        ? searchState.value?.searchBy
                        : Object.keys(option);
                    return searchBy.some(key => {
                        const optionValue = option[key];
                        if (!optionValue) return false;
                        const normalizedOption = optionValue
                            .toString()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLowerCase();
                        const normalizedFilter = filterValue
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLowerCase();

                        return normalizedOption.includes(normalizedFilter);
                    });
                }
            });
        });

        const filteredOptions = computed(() => {
            if (!searchState.value || !searchState.value.value) return options.value;
            let filtered = memoizedFilter(options.value, searchState.value.value);
            return filtered;
        });

        const dynamicScrollerItems = computed(() => {
            return filteredOptions.value.map((item, index) => {
                // Handle primitive values properly - don't spread them as they become indexed objects
                const isPrimitive = typeof item !== 'object' || item === null;
                if (isPrimitive) {
                    // For primitives, create a simple object wrapper
                    return { value: item, id: `id_${index}` };
                } else {
                    // For objects, use the existing spread logic
                    return { ...item, id: item.id ?? `id_${index}` };
                }
            });
        });

        /*
         * The select derives its option list (keyboard navigation, local context) from this array,
         * so it covers every filtered option and not just the ones the scroller has mounted.
         */
        watch(
            dynamicScrollerItems,
            items => {
                registerFilteredOptions(items);
            },
            { immediate: true }
        );

        onBeforeUnmount(() => registerFilteredOptions([]));

        /*
         * Bring the focused option into view. When it is outside the rendered window there is no
         * element to scroll, so the virtual scroller is asked to jump to that index instead - its
         * position is estimated from unmeasured item sizes, hence the scrollIntoView afterwards to
         * settle on the exact offset once the option is really there.
         */
        const scrollToFocusedOption = () => {
            const id = activeDescendant.value;
            if (!id) return;

            const frontDocument = wwLib.getFrontDocument();
            if (!frontDocument.getElementById(id)) {
                const scroller = heavyMode.value ? recycleScrollerRef.value : dynamicScrollerRef.value;
                scroller?.scrollToItem?.(focusedOptionIndex.value);
            }

            frontDocument.getElementById(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };

        /*
         * nextTick gets us past the render, requestAnimationFrame past the virtual scroller's own
         * mounted nextTick: until that has run the scroll area still has no height, and anything we
         * set on scrollTop is clamped back to 0 - which is why the dropdown used to open at the top
         * of the list instead of at the selected option.
         */
        const scheduleScrollToFocusedOption = () => {
            nextTick(() => wwLib.getFrontWindow().requestAnimationFrame(scrollToFocusedOption));
        };

        watch(activeDescendant, scheduleScrollToFocusedOption);
        onMounted(scheduleScrollToFocusedOption);

        watch(filteredOptions, () => {
            if (updateSearch) {
                const searchMatches = searchState.value && searchState.value.value ? filteredOptions.value : [];
                updateSearch({ ...searchState.value, searchMatches });
            }
        });

        // Styles
        const scrollerStyle = computed(() => {
            // Use flex: 1 to take all available space in the flex container
            // This ensures the scroller has a definite height for virtual scrolling
            return {
                flex: '1',
                'min-height': '0', // Important for flex children to shrink below content size
                padding: props.content.dropdownPadding,
            };
        });

        const emptyStateStyle = computed(() => {
            return {
                'font-family': props.content.emptyStateFontFamily,
                'font-size': props.content.emptyStateFontSize,
                'font-weight': props.content.emptyStateFontWeight,
                color: props.content.emptyStateFontColor,
                padding: props.content.emptyStatePadding,
                'text-align': props.content.emptyStateTextAlign,
                width: '100%',
            };
        });

        // Watch
        watch(
            optionProperties,
            value => {
                emit('update:sidepanel-content', { path: 'optionProperties', value });
                if (registerOptionProperties) registerOptionProperties(value);
            },
            { immediate: true }
        );

        /* wwEditor:start */
        watch(
            isEditing,
            () => {
                emit('update:sidepanel-content', { path: 'showEmptyStateInEditor', value: false });
            },
            { immediate: true, deep: true }
        );
        /* wwEditor:end */

        return {
            emptyStateText,
            filteredOptions,
            virtualScrollMinItemSize,
            virtualScrollBuffer,
            heavyMode,
            itemSize,
            showEmptyStateInEditor,
            dynamicScrollerItems,
            scrollerStyle,
            emptyStateStyle,
            recycleScrollerRef,
            dynamicScrollerRef,
        };
    },
};
</script>

<style>
@import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
</style>

<style scoped>
.scroller {
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
        display: none;
    }
}
</style>
