import { AbstractControl, FormGroup } from "@angular/forms";
import { isSignal, Signal, signal, WritableSignal } from "@angular/core";
import { FormValueModified } from "./directives/form-modified.directive";
import { ValueChanges } from "./directives/form.directive";

/**
 *     Add in form host directives section:
 *     {
 *       directive: FormModifiedDirective,
 *       outputs: ['formValueModified'], // this is optional - same data exposed as output
 *     },
 */

export function setFormModified<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>, modifications: FormValueModified): void {
  ensureSignal(formGroup, formModified).set(modifications);
}

export function setRootBeforeUserChange<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  ensureSignal(formGroup.root, beforeUserChange).set(values);
}

export function getFormModified<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): FormValueModified | undefined {
  return ensureSignal<FormValueModified>(formGroup, formModified)();
}

export function getFormModified$<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): Signal<FormValueModified | undefined> {
  return ensureSignal<FormValueModified>(formGroup, formModified).asReadonly();
}

export function getRootBeforeUserChange<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): ValueChanges<T, UserTypes> | undefined {
  return getRootBeforeUserChange$<T, UserTypes>(formGroup)();
}

export function getRootBeforeUserChange$<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): Signal<ValueChanges<T, UserTypes> | undefined> {
  return ensureSignal<ValueChanges<T, UserTypes>>(formGroup.root, beforeUserChange).asReadonly();
}


/**
 * helpers
 */

function ensureSignal<T>(obj: any, key: any): WritableSignal<T | undefined> {
  if (obj && key && !isSignal(obj[key])) {
    obj[key] = signal(obj[key]);
  }
  return obj[key];
}



/**
 * Symbols
 */
const formModified: unique symbol = Symbol('formModified');
const beforeUserChange: unique symbol = Symbol('beforeUserChange');
