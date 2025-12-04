import { AbstractControl, FormGroup } from "@angular/forms";
import { isSignal, Signal, signal, WritableSignal } from "@angular/core";
import { filter, tap } from "rxjs";

/**
 * Example:
 *```ts
 *   protected isFormDisabled = computed((): boolean => isFormGroupDisabled$(this.formDirective.form$().controls.myFormGroup)());
 * ```
 * @param formGroup
 */
export function isFormGroupDisabled$<T extends { [K in keyof T]: AbstractControl<any, any>}>(formGroup: FormGroup<T>): Signal<boolean> {
  if (!isSignal((formGroup as any)[formGroupDisabled])) {
    (formGroup as any)[formGroupDisabled] = signal(formGroup.disabled);
    const isDisabled = (formGroup as any)[formGroupDisabled] as WritableSignal<boolean>;
    formGroup.statusChanges.pipe(
      filter(() => isDisabled() !== formGroup.disabled),
      tap(() => isDisabled.set(formGroup.disabled)),
    ).subscribe();
  }
  return ((formGroup as any)[formGroupDisabled] as WritableSignal<boolean>).asReadonly();
}


/**
 * Symbols
 */
const formGroupDisabled: unique symbol = Symbol('formGroupDisabled');
