const isObject = (obj: any) => obj && typeof obj === 'object';
export function mergeDeep(target: any, source: any, opts?: { mergeArrays?: boolean; immutable?: boolean;}): any {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }
  if (opts?.immutable) {
    target = {...target};
  }
  Object.keys(source).forEach(key => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = opts?.mergeArrays ? [...targetValue, ...sourceValue] : sourceValue;
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = mergeDeep(targetValue, sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}
