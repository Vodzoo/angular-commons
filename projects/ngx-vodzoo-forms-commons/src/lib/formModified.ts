import { AbstractControl, FormGroup } from "@angular/forms";
import { isSignal, Signal, signal, WritableSignal } from "@angular/core";
import { FormValueModified } from "./directives/form-modified.directive";

export function setFormModified<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>, modifications: FormValueModified): void {
  ensureSignal(formGroup, formModified).set(modifications);
}

export function getFormModified<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): FormValueModified | undefined {
  return ensureSignal(formGroup, formModified)();
}

export function getFormModified$<T extends { [K in keyof T]: AbstractControl<any, any>; }>(formGroup: FormGroup<T>): Signal<FormValueModified | undefined> {
  return ensureSignal(formGroup, formModified).asReadonly();
}


/**
 * helpers
 */

function ensureSignal(obj: any, key: any): WritableSignal<FormValueModified> {
  if (obj && key && !isSignal(obj[key])) {
    obj[key] = signal(obj[key]);
  }
  return obj[key];
}



/**
 * Symbols
 */
const formModified: unique symbol = Symbol('formModified');
