export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

export function findValueIndex(array, value) {
    if (typeof value === 'object' && value !== null) {
        return array.findIndex(item => {
            if (typeof item !== 'object' || item === null) return false;
            return JSON.stringify(item) === JSON.stringify(value);
        });
    } else {
        return array.indexOf(value);
    }
}

export function areValuesEqual(value1, value2) {
    if (typeof value1 === 'object' && value1 !== null && typeof value2 === 'object' && value2 !== null) {
        return JSON.stringify(value1) === JSON.stringify(value2);
    }
    return value1 === value2;
}

/*
 * A stable key for a value, matching the comparison semantics of areValuesEqual:
 * objects are compared by their JSON representation, primitives by strict equality
 * (so 1 and '1' never collide). Used to test selection in O(1) over large lists.
 */
export function getValueKey(value) {
    if (typeof value === 'object' && value !== null) return `o:${JSON.stringify(value)}`;
    return `${typeof value}:${String(value)}`;
}

/*
 * The options list has to wrap primitive entries ('a', 42) into objects for the virtual scroller.
 * The wrapper is tagged with a symbol rather than recognised by its shape: a real data object of
 * exactly { value, id } is indistinguishable otherwise, and would have its value/label mappings
 * silently skipped. Symbols stay out of Object.keys and JSON, so the tag is invisible to users.
 */
export const WRAPPED_PRIMITIVE = Symbol('wwSelect:wrappedPrimitive');

export function isWrappedPrimitive(item) {
    return item !== null && typeof item === 'object' && item[WRAPPED_PRIMITIVE] === true;
}

/*
 * Option label/value/id resolution lives here so that the select (which drives keyboard
 * navigation and the local context from the whole data set) and the option component
 * (which renders only the items the virtual scroller mounted) always agree.
 */
export function resolveOptionValue(item, mappingValue, resolveMappingFormula, fallbackValue) {
    if (isWrappedPrimitive(item)) return item.value;
    if (item === null || typeof item !== 'object') return item;
    return resolveMappingFormula(mappingValue, item) ?? fallbackValue ?? item;
}

export function resolveOptionLabel(item, mappingLabel, resolveMappingFormula, fallbackLabel) {
    if (isWrappedPrimitive(item)) return item.value;
    if (item === null || typeof item !== 'object') return item;
    // Nullish rather than falsy: a label mapped onto an empty or zero field is a label, and
    // falling through the whole chain used to end at the item itself, rendering [object Object].
    return resolveMappingFormula(mappingLabel, item) ?? item.label ?? item.text ?? fallbackLabel ?? item;
}

export function getOptionId(uid, index) {
    return `ww-select-option-${uid}-${index}`;
}
