<template>
    <!-- Heavy Mode: RecycleScroller for better performance with large lists -->
    <RecycleScroller
        v-if="heavyMode && filteredOptions.length > 0"
        ref="recycleScrollerRef"
        class="scroller"
        :style="scrollerStyle"
        :items="rows"
        :item-size="itemSize"
        :buffer="virtualScrollBuffer"
        key-field="id"
    >
        <template v-slot="{ item: row, index }">
            <div :style="index != rows.length - 1 ? { paddingBottom: content.optionSpacing } : {}">
                <div v-if="row.isGroupHeader" :id="row.domId" role="presentation" :style="groupLabelStyle(row)">
                    {{ row.label }}
                </div>
                <wwLayoutItemContext v-else :key="row.index" is-repeat :index="row.index" :data="row.item">
                    <ww-element-option
                        :local-data="row.item"
                        :index="row.index"
                        :content="content"
                        :wwEditorState="wwEditorState"
                    />
                </wwLayoutItemContext>
            </div>
        </template>
    </RecycleScroller>

    <!-- Normal Mode: DynamicScroller with automatic size detection -->
    <DynamicScroller
        v-else-if="!heavyMode && filteredOptions.length > 0"
        ref="dynamicScrollerRef"
        class="scroller"
        :style="scrollerStyle"
        :items="rows"
        :min-item-size="virtualScrollMinItemSize"
        :buffer="virtualScrollBuffer"
    >
        <template v-slot="{ item: row, index, active }">
            <DynamicScrollerItem
                :item="row"
                :active="active"
                :size-dependencies="JSON.stringify(row.isGroupHeader ? row.label : row.item)"
                :data-index="index"
            >
                <div :style="index != rows.length - 1 ? { paddingBottom: content.optionSpacing } : {}">
                    <div v-if="row.isGroupHeader" :id="row.domId" role="presentation" :style="groupLabelStyle(row)">
                        {{ row.label }}
                    </div>
                    <wwLayoutItemContext v-else :key="row.index" is-repeat :index="row.index" :data="row.item">
                        <ww-element-option
                            :local-data="row.item"
                            :index="row.index"
                            :content="content"
                            :wwEditorState="wwEditorState"
                        />
                    </wwLayoutItemContext>
                </div>
            </DynamicScrollerItem>
        </template>
    </DynamicScroller>

    <div v-show="filteredOptions.length === 0 || showEmptyStateInEditor" :style="emptyStateStyle">
        <span>{{ emptyStateText }}</span>
    </div>
</template>

<script>
import InputSelectOption from './wwElement_Option.vue';
import { WRAPPED_PRIMITIVE, getOptionId, resolveOptionGroup } from './utils';
import { ref, inject, computed, watch, nextTick, onMounted, onBeforeUnmount, toValue } from 'vue';
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

        const { resolveMappingFormula } = wwLib.wwFormula.useFormula();

        const rawData = inject('_wwSelect:rawData', ref([]));
        const selectUid = inject('_wwSelect:uid', '');
        const mappingGroup = inject('_wwSelect:mappingGroup', ref(null));
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

        /*
         * Options sharing a group are gathered under one header, groups in the order their first
         * option appears in the data. Options without a group come first, with no header - the way
         * a shadcn select lists loose items before its labelled groups. Without any group mapped
         * this is the filtered list untouched.
         */
        const optionGroups = computed(() => {
            const mapping = toValue(mappingGroup);
            const groups = new Map([[null, []]]);
            for (const item of filteredOptions.value) {
                const group = resolveOptionGroup(item, mapping, resolveMappingFormula);
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group).push(item);
            }
            return [...groups].filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }));
        });

        // The options in display order - what the select navigates over, grouped or not.
        const orderedOptions = computed(() => optionGroups.value.flatMap(group => group.items));

        const dynamicScrollerItems = computed(() => {
            return orderedOptions.value.map((item, index) => {
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
         * What the scroller renders: the options, each group preceded by a header row. Option rows
         * keep their option index, which is what their DOM id, the keyboard focus and the local
         * context are built from - headers are never part of the option list.
         */
        const rows = computed(() => {
            const rows = [];
            let index = 0;
            for (const group of optionGroups.value) {
                if (group.label !== null) {
                    rows.push({
                        id: `__ww-select-group-${rows.length}`,
                        isGroupHeader: true,
                        isFirst: rows.length === 0,
                        label: group.label,
                        // Named after its first option, so scrolling to that option can bring it too.
                        domId: `${getOptionId(selectUid, index)}-group`,
                    });
                }
                for (let i = 0; i < group.items.length; i++, index++) {
                    const item = dynamicScrollerItems.value[index];
                    rows.push({ id: item.id, index, item });
                }
            }
            return rows;
        });

        // Row to scroll to for each option: its group header when it opens a group, so moving up
        // onto a group's first option reveals the group label rather than stopping just below it.
        const scrollRowByOptionIndex = computed(() => {
            const map = [];
            rows.value.forEach((row, rowIndex) => {
                if (row.isGroupHeader) return;
                map[row.index] = rows.value[rowIndex - 1]?.isGroupHeader ? rowIndex - 1 : rowIndex;
            });
            return map;
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
                frontDocument.getElementById(`${id}-group`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                focusedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                return;
            }

            // The option is outside the rendered window, so there is nothing to scroll into view.
            scroller?.scrollToItem?.(
                scrollRowByOptionIndex.value[focusedOptionIndex.value] ?? focusedOptionIndex.value
            );

            /*
             * scrollToItem only sets scrollTop, from sizes it had to estimate for everything it
             * never measured, and the scroller renders the new window on its own scroll handler.
             * The option therefore exists a frame later - that is when the offset can be settled.
             */
            wwLib.getFrontWindow().requestAnimationFrame(() => {
                frontDocument.getElementById(`${id}-group`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
            },
            { immediate: true }
        );

        /*
         * The scroller is no longer remounted when the list changes, so the offset has to be
         * reconciled explicitly - but only when the list the user is looking at really changed.
         * Keyed on the query and the item count rather than on the array identity: a bound formula
         * can hand us a fresh array of the same options on any reactive tick, and yanking a
         * mouse-scrolled dropdown back to the top for that would be worse than the stale offset.
         */
        watch(
            () => [searchState.value?.value, dynamicScrollerItems.value.length],
            () => scheduleScrollToFocusedOption({ resetWhenUnfocused: true })
        );

        onBeforeUnmount(() => registerFilteredOptions([]));

        // Wrapped: neither the watcher arguments nor the mounted hook are scroll options.
        watch(activeDescendant, () => scheduleScrollToFocusedOption());
        onMounted(() => scheduleScrollToFocusedOption({ resetWhenUnfocused: true }));

        watch(orderedOptions, () => {
            if (!updateSearchMatches) return;
            updateSearchMatches(searchState.value?.value ? orderedOptions.value : []);
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

        // A function of the row: only the separator depends on it (none above the first group).
        const groupLabelStyle = row => ({
            'font-family': props.content.groupLabelFontFamily,
            'font-size': props.content.groupLabelFontSize,
            'font-weight': props.content.groupLabelFontWeight,
            color: props.content.groupLabelFontColor,
            padding: props.content.groupLabelPadding,
            'white-space': props.content.optionNoWrap ? 'nowrap' : undefined,
            overflow: props.content.optionNoWrap ? 'hidden' : undefined,
            'text-overflow': props.content.optionNoWrap ? 'ellipsis' : undefined,
            'border-top': row.isFirst ? undefined : props.content.groupSeparator,
            'margin-top': row.isFirst ? undefined : props.content.groupSpacing,
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
            rows,
            groupLabelStyle,
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
