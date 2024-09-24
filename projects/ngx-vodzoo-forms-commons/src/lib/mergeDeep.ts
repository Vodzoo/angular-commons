import {InjectionToken} from "@angular/core";

export const DEFAULT_MERGE_CONFIG: MergeConfig = {

} as const;

export const MERGE_CONFIG: InjectionToken<MergeConfig> = new InjectionToken<MergeConfig>('MERGE_CONFIG', {
  factory: () => DEFAULT_MERGE_CONFIG
});

export interface MergeConfig {
  skipMerging?: (target: any, source: any) => boolean;
}

const isObject = (obj: any) => obj && typeof obj === 'object';
export function mergeDeep(target: any, source: any, opts?: { mergeArrays?: boolean; immutable?: boolean; skipMerging?: (target: any, source: any) => boolean}): any {
  if (source instanceof Date || !isObject(target) || !isObject(source) || opts?.skipMerging?.(target, source)) {
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
      target[key] = mergeDeep(targetValue, sourceValue, opts);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}
