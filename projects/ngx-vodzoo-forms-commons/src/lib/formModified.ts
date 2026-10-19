import { AbstractControl, FormGroup } from "@angular/forms";
import { isSignal, Signal, signal, WritableSignal } from "@angular/core";
import { FormValueModified } from "./directives/form-modified.directive";
import { FormValues } from "./directives/form.directive";

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

export function setBeforeUserChange<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: FormValues<T, UserTypes>): void {
  ensureSignal(formGroup, beforeUserChange).set(values);
}

export function getFormModified<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): FormValueModified | undefined {
  return ensureSignal<FormValueModified>(formGroup, formModified)();
}

export function getFormModified$<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): Signal<FormValueModified | undefined> {
  return ensureSignal<FormValueModified>(formGroup, formModified).asReadonly();
}

export function getBeforeUserChange<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): FormValues<T, UserTypes> | undefined {
  return getBeforeUserChange$<T, UserTypes>(formGroup)();
}

export function getBeforeUserChange$<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): Signal<FormValues<T, UserTypes> | undefined> {
  return ensureSignal<FormValues<T, UserTypes>>(formGroup, beforeUserChange).asReadonly();
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
