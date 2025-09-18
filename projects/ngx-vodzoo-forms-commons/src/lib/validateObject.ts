/**
 * `Example:`
 *
 * Interfaces:
 * ```ts
 * interface A {
 *   name?: string;
 *   objectB?: B;
 * }
 * type ValidatedA = A & {objectB: ValidatedB };
 * ```
 * ```ts
 * interface B {
 *   surname?: string;
 * }
 * type ValidatedB = B & {surname: string};
 * ```
 *
 * Objects:
 * ```ts
 * const objectB: B = {
 *   surname: undefined,
 * };
 *
 * const objectA: A = {
 *   name: undefined,
 *   objectB: objectB,
 * };
 * ```
 * ValidationFns:
 * ```ts
 * function validateA1(a?: A | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!a) {
 *     return { errors: ['No object A!'] };
 *   }
 *   if (!a.name) {
 *     errors.push('Name is required!');
 *   }
 *
 *   errors.push(...validateB1(a.objectB).errors);
 *
 *   return {
 *     errors,
 *   };
 * }
 * ```
 * ```ts
 * function validateA2(a?: A | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!a) {
 *     return { errors: ['No object A!'] };
 *   }
 *   if (a.name !== 'Mark') {
 *     errors.push('Name is not Mark');
 *   }
 *
 *   errors.push(...validateB2(a.objectB).errors);
 *
 *   return {
 *     errors,
 *   };
 * }
 * ```
 * ```ts
 * function validateB1(b?: B | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!b) {
 *     return { errors: ['No object B!'] };
 *   }
 *
 *   if (!b.surname) {
 *     errors.push('Surname is required!');
 *   }
 *
 *   return { errors };
 * }
 * ```
 * ```ts
 * function validateB2(b?: B | null): ValidationStatus {
 *   const errors: string[] = [];
 *   if (!b) {
 *     return { errors: ['No object B!'] };
 *   }
 *
 *   if (b.surname !== 'Norton') {
 *     errors.push('Surname is not Norton!');
 *   }
 *
 *   return { errors };
 * }
 * ```
 * Run validation:
 * ```ts
 * const validatedA: ValidatedA = validateObject<A, ValidatedA>({
 *   object: objectA,
 *   validateFn: (withValidatorFn) => {
 *     withValidatorFn(validateA1);
 *     withValidatorFn(validateA2);
 *   },
 *   onErrorFn: statuses => console.log(statuses.get(validateA2)),
 * });
 *
 * console.log(validatedA.objectB.surname.toLowerCase());
 * ```
 * @param spec
 */
export function validateObject<T, R extends T>(spec: ValidateSpec<T>): R {
  const allErrors: Set<string> = new Set();
  const statuses: Map<ValidatorFn<T>, ValidationStatus> = new Map();
  spec.validateFn((validatorFn: ValidatorFn<T>) => {
    const status: ValidationStatus = validatorFn(spec.object);
    statuses.set(validatorFn, status);
    status.errors.forEach(error => allErrors.add(error));
  });
  if (allErrors.size) {
    spec?.onErrorFn?.(statuses);
    throw new Error(`\n- ${Array.from(allErrors).join('\n- ')}`);
  }
  return spec.object as R;
}


/**
 * Interfaces & types
 */

export interface ValidateSpec<T> {
  object: T;
  validateFn: ValidateFn<T>;
  onErrorFn?: OnErrorFn<T>;
}
export interface ValidationStatus {
  errors: string[];
}
export type ValidateFn<T> = (withValidatorFn: WithValidatorFn<T>) => void;
export type WithValidatorFn<T> = (validatorFn: ValidatorFn<T>) => void;
export type ValidatorFn<T> = (obj: T) => ValidationStatus;
export type OnErrorFn<T> = (statuses: OnErrorFnStatuses<T>) => void;
export type OnErrorFnStatuses<T> = Map<ValidatorFn<T>, ValidationStatus>;
