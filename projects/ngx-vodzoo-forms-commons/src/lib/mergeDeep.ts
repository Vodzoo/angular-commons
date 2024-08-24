export function mergeDeep(target: any, source: any, mergeArrays?: boolean) {
  const isObject = (obj: any) => obj && typeof obj === 'object';

  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  Object.keys(source).forEach(key => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = mergeArrays ? targetValue.concat(sourceValue) : sourceValue;
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = mergeDeep({...targetValue}, sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}
