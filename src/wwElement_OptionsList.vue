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
import { WRAPPED_PRIMITIVE } from './utils';
import { ref, inject, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from 'vue-virtual-scroller';
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
        const { updateSearchMatches } = inject('_wwSelect:useSearch', {});
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

        const normalizeText = value =>
            String(value)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();

        /*
         * Plain computed rather than useMemoize: its default cache key is a JSON.stringify of the
         * arguments, so every keystroke serialized the whole option list to look the cache up, and
         * nothing ever evicted the entries. A computed already caches until its dependencies move.
         */
        const filteredOptions = computed(() => {
            const search = searchState.value?.value;
            if (!search) return options.value;

            // Normalized once per pass instead of once per option per key.
            const needle = normalizeText(search);
            const searchBy = searchState.value?.searchBy?.length ? searchState.value.searchBy : null;

            return options.value.filter(option => {
                const isPrimitive = typeof option !== 'object' || option === null;
                if (isPrimitive) return normalizeText(option).includes(needle);

                return (searchBy ?? Object.keys(option)).some(key => {
                    const value = option[key];
                    if (!value) return false;
                    return normalizeText(value).includes(needle);
                });
            });
        });

        const dynamicScrollerItems = computed(() => {
            return filteredOptions.value.map((item, index) => {
                // Handle primitive values properly - don't spread them as they become indexed objects
                const isPrimitive = typeof item !== 'object' || item === null;
                if (isPrimitive) {
                    // Tagged so it cannot be mistaken for a data object of the same shape.
                    return { value: item, id: `id_${index}`, [WRAPPED_PRIMITIVE]: true };
                } else {
                    // For objects, use the existing spread logic
                    return { ...item, id: item.id ?? `id_${index}` };
                }
            });
        });

        /*
         * Bring the focused option into view. When it is outside the rendered window there is no
         * element to scroll, so the virtual scroller is asked to jump to that index instead - its
         * position is estimated from unmeasured item sizes, hence the scrollIntoView afterwards to
         * settle on the exact offset once the option is really there.
         */
        const scrollToFocusedOption = ({ resetWhenUnfocused = false } = {}) => {
            const scroller = heavyMode.value ? recycleScrollerRef.value : dynamicScrollerRef.value;
            const id = activeDescendant.value;

            if (!id) {
                // Only when the list itself changed: a filter can leave an offset belonging to the
                // previous list, which the browser clamps to the end of the shorter one. Clearing
                // the focus alone - unselecting an option - must leave the scroll where it is.
                if (resetWhenUnfocused) scroller?.scrollToItem?.(0);
                return;
            }

            const frontDocument = wwLib.getFrontDocument();
            const focusedElement = frontDocument.getElementById(id);
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                return;
            }

            // The option is outside the rendered window, so there is nothing to scroll into view.
            scroller?.scrollToItem?.(focusedOptionIndex.value);

            /*
             * scrollToItem only sets scrollTop, from sizes it had to estimate for everything it
             * never measured, and the scroller renders the new window on its own scroll handler.
             * The option therefore exists a frame later - that is when the offset can be settled.
             */
            wwLib.getFrontWindow().requestAnimationFrame(() => {
                frontDocument.getElementById(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            });
        };

        /*
         * nextTick gets us past the render, requestAnimationFrame past the virtual scroller's own
         * mounted nextTick: until that has run the scroll area still has no height, and anything we
         * set on scrollTop is clamped back to 0 - which is why the dropdown used to open at the top
         * of the list instead of at the selected option.
         */
        const scheduleScrollToFocusedOption = (options = {}) => {
            nextTick(() => wwLib.getFrontWindow().requestAnimationFrame(() => scrollToFocusedOption(options)));
        };

        /*
         * The select derives its option list (keyboard navigation, local context) from this array,
         * so it covers every filtered option and not just the ones the scroller has mounted.
         */
        watch(
            dynamicScrollerItems,
            items => {
                registerFilteredOptions(items);
                // The scroller is no longer remounted on every count change, so the scroll offset
                // has to be brought back in line with the new list explicitly.
                scheduleScrollToFocusedOption({ resetWhenUnfocused: true });
            },
            { immediate: true }
        );

        onBeforeUnmount(() => registerFilteredOptions([]));

        // Wrapped: neither the watcher arguments nor the mounted hook are scroll options.
        watch(activeDescendant, () => scheduleScrollToFocusedOption());
        onMounted(() => scheduleScrollToFocusedOption({ resetWhenUnfocused: true }));

        watch(filteredOptions, () => {
            if (!updateSearchMatches) return;
            updateSearchMatches(searchState.value?.value ? filteredOptions.value : []);
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
