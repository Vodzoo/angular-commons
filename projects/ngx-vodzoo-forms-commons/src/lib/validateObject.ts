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
 *   const errors: RawValidationError[] = [];
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
 *   const errors: RawValidationError[] = [];
 *   if (!value) {
 *     return { errors: [{ message: 'No data with cause!', cause: 'CODE_123' }] };
 *   }
 *   errors.push(...validateSubData2(value.subdata2).errors);
 *
 *   return { errors };
 * }
 * ```
 * @param spec
 */
export function validateObject<T, R extends T>(spec: ValidateSpec<T>): ValidateObjectStatus<R> {
  const allErrors: ValidationError[] = [
    ...spec.initialErrors?.map(normalizeError) ?? [],
    ...spec.validateFn(spec.object).errors.map(normalizeError)
  ];
  if (allErrors.length) {
    const opts: OnErrorOpts | undefined = spec?.onErrorFn?.(allErrors);
    if ((VALIDATE_OBJECT_CONFIG.skipThrow !== true && opts?.skipThrow !== true)
      || (VALIDATE_OBJECT_CONFIG.skipThrow === true && opts?.skipThrow === false)
    ) {
      throw new Error(`\n- ${allErrors.map(error => error.message).join('\n- ')}`, {
        cause: allErrors,
      });
    }
  }
  return {
    object: spec.object as R,
    errors: allErrors,
  };
}

function normalizeError(error: RawValidationError): ValidationError {
  return typeof error === 'string' ? { message: error } : error;
}

// Interfaces & types

export interface ValidateSpec<T> {
  object: T;
  validateFn: ValidateFn<T>;
  onErrorFn?: OnErrorFn;
  initialErrors?: RawValidationError[];
}
export interface ValidationStatus {
  errors: RawValidationError[];
}
export interface ValidationError {
  message: string;
  cause?: unknown;
}
export interface OnErrorOpts {
  skipThrow?: boolean;
}
export type ValidateObjectConfig = OnErrorOpts;
export type ValidateFn<T> = (object: T) => ValidationStatus;
export type OnErrorFn = (errors: ValidationError[]) => OnErrorOpts | undefined;
export type ValidateObjectStatus<T> = { object: T } & ValidationStatus;
export type RawValidationError = string | ValidationError;
