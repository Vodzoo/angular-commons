/**
 * validateObject function config
 */
export const VALIDATE_OBJECT_CONFIG: ValidateObjectConfig = {};

/**
 * ```ts
 * VALIDATE_OBJECT_CONFIG.skipThrow = true; // by default, the function will throw Error() when there are errors returned by ValidateFn
 *
 * const validatedData = validateObject<Data, ValidatedData>({
 *   object: data,
 *   validateFn: validateData,
 *   onErrorFn: errors => {
 *     // custom error logic, eg. send errors to alert service
 *     return { skipThrow: false }; // return false to throw Error() - overrides VALIDATE_OBJECT_CONFIG
 *   },
 *   initialErrors: validateObject({
 *     object: data2,
 *     validateFn: validateData2,
 *     onErrorFn: () => ({ skipThrow: true }), // skip throw to get errors from returned object
 *   }).errors, // these errors will be merged with errors from validateData
 * });
 *
 * console.log(validatedPodmiot.object); // object with ValidatedData type
 * console.log(validatedPodmiot.errors); // non-empty array when skipThrow = false and there are errors returned by ValidateFn
 * ```
 * ```ts
 * const validateData: ValidateFn<Data> = (object) => {
 *   return {
 *     errors: [
 *       ...validate1(object).errors,
 *       ...validate2(object).errors,
 *     ],
 *   };
 * };
 * ```
 * ```ts
 * function validate1(value?: Data | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!value) {
 *     return { errors: ['No data!'] };
 *   }
 *   errors.push(...validateSubData(value.subdata1).errors);
 *
 *   return { errors };
 * }
 *
 *
 * function validate2(value?: Data | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!value) {
 *     return { errors: ['No data!'] };
 *   }
 *   errors.push(...validateSubData2(value.subdata2).errors);
 *
 *   return { errors };
 * }
 * ```
 * @param spec
 */
export function validateObject<T, R extends T>(spec: ValidateSpec<T>): ValidateObjectStatus<R> {
  const allErrors: Set<string> = new Set();
  spec.initialErrors?.forEach(error => allErrors.add(error));
  spec.validateFn(spec.object).errors.forEach(error => allErrors.add(error));
  const errors: string[] = Array.from(allErrors);
  if (allErrors.size) {
    const opts: OnErrorOpts | undefined = spec?.onErrorFn?.(errors);
    if ((VALIDATE_OBJECT_CONFIG.skipThrow !== true && opts?.skipThrow !== true)
      || (VALIDATE_OBJECT_CONFIG.skipThrow === true && opts?.skipThrow === false)
    ) {
      throw new Error(`\n- ${errors.join('\n- ')}`);
    }
  }
  return {
    object: spec.object as R,
    errors,
  };
}

// Interfaces & types

export interface ValidateSpec<T> {
  object: T;
  validateFn: ValidateFn<T>;
  onErrorFn?: OnErrorFn;
  initialErrors?: string[];
}
export interface ValidationStatus {
  errors: string[];
}
export interface OnErrorOpts {
  skipThrow?: boolean;
}
export type ValidateObjectConfig = OnErrorOpts;
export type ValidateFn<T> = (object: T) => ValidationStatus;
export type OnErrorFn = (errors: string[]) => OnErrorOpts | undefined;
export type ValidateObjectStatus<T> = { object: T } & ValidationStatus;
