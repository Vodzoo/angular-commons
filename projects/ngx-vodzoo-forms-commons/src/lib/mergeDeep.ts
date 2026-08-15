import {InjectionToken} from "@angular/core";

export const DEFAULT_MERGE_CONFIG: MergeConfig = {

} as const;

export const MERGE_CONFIG: InjectionToken<MergeConfig> = new InjectionToken<MergeConfig>('MERGE_CONFIG', {
  factory: () => DEFAULT_MERGE_CONFIG
});

export interface MergeConfig {
  skipMerging?: (target: any, source: any) => boolean;
}

const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);

const hasBlockedKey = (value: object): boolean =>
  [...blockedKeys].some(key => Object.prototype.hasOwnProperty.call(value, key));

const withoutBlockedKeys = (value: object): object => {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  blockedKeys.forEach(key => delete descriptors[key]);
  return Object.create(Object.getPrototypeOf(value), descriptors);
};

const isPlainObject = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  const constructor = Object.getOwnPropertyDescriptor(value, 'constructor')?.value;
  return typeof constructor !== 'function' || constructor.prototype !== value;
};

export function mergeDeep(target: any, source: any, opts?: { mergeArrays?: boolean; immutable?: boolean; skipMerging?: (target: any, source: any) => boolean}): any {
  if (source instanceof Date || !isPlainObject(target) || !isPlainObject(source) || opts?.skipMerging?.(target, source)) {
    return source;
  }
  if (opts?.immutable) {
    target = {...target};
  }
  Object.keys(source).forEach(key => {
    if (blockedKeys.has(key)) {
      return;
    }

    const targetValue = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
    const sourceValue = source[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = opts?.mergeArrays ? [...targetValue, ...sourceValue] : sourceValue;
    }  else if (targetValue instanceof Map && sourceValue instanceof Map) {
      target[key] = new Map([...targetValue, ...sourceValue]);
    } else if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      target[key] = mergeDeep(targetValue, sourceValue, opts);
    } else if (isPlainObject(sourceValue) && hasBlockedKey(sourceValue)) {
      target[key] = withoutBlockedKeys(sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}
