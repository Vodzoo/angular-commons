import {AbstractControl, FormGroup} from "@angular/forms";
import {FormValue, ValueChanges} from "./directives/form.directive";
import { isSignal, Signal, signal, WritableSignal } from "@angular/core";

export function setRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  ensureSignal(formGroup.root, rootFormValueChanges).set(values);
}

export function setRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: FormValue<T, UserTypes>): void {
  (formGroup.root as any)[rootFormInitialValue] = values;
}

export function getRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): ValueChanges<R, UserTypes> | undefined {
  return ensureSignal(formGroup.root, rootFormValueChanges)();
}

export function getRootFormValueChanges$<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): Signal<ValueChanges<R, UserTypes> | undefined> {
  return ensureSignal(formGroup.root, rootFormValueChanges).asReadonly();
}

export function getRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): FormValue<R, UserTypes> {
  return (formGroup.root as any)[rootFormInitialValue];
}

function ensureSignal<W extends T[R], T extends object = any, R extends keyof T = any>(obj: T, key: R | symbol): WritableSignal<W> {
  if (obj && key && !isSignal(obj[key as unknown as R])) {
    obj[key as unknown as R] = signal(obj[key as unknown as R]) as W;
  }
  return obj[key as unknown as R] as WritableSignal<W>;
}

const rootFormValueChanges: unique symbol = Symbol('rootFormValueChanges');
const rootFormInitialValue: unique symbol = Symbol('rootFormInitialValue');
