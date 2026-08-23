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
 * The options list wraps primitive entries into { value, id } objects, so an item
 * with exactly those two keys is a primitive that has been wrapped, not a data object.
 */
export function isWrappedPrimitive(item) {
    return (
        item !== null && typeof item === 'object' && 'value' in item && 'id' in item && Object.keys(item).length === 2
    );
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
    return resolveMappingFormula(mappingLabel, item) || item.label || item.text || fallbackLabel || item;
}

export function getOptionId(uid, index) {
    return `ww-select-option-${uid}-${index}`;
}
