import { AbstractControl, FormArray, FormGroup } from "@angular/forms";
import {FormValue, ValueChanges} from "./directives/form.directive";
import { computed, isSignal, Signal, signal, WritableSignal } from "@angular/core";

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

export function getFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes>(formGroup: FormGroup<T>): ValueChanges<T, UserTypes> | undefined {
  return getFormValueChanges$<T, UserTypes>(formGroup)();
}

export function getFormValueChanges$<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes>(formGroup: FormGroup<T>): Signal<ValueChanges<T, UserTypes> | undefined> {
  const path: string[] | null = getFormPath(formGroup);
  const changes = getRootFormValueChanges$(formGroup);
  return computed(() => {
    const rootValueChanges = changes();
    if (!rootValueChanges) {
      return undefined;
    }
    if (!path) {
      return rootValueChanges;
    }

    const previousRawValue = getNestedValue(rootValueChanges?.previous.rawValue, path);
    const previousValue = getNestedValue(rootValueChanges?.previous.value, path);
    const currentRawValue = getNestedValue(rootValueChanges?.current.rawValue, path);
    const currentValue = getNestedValue(rootValueChanges?.current.value, path);
    return {
      ...rootValueChanges,
      previous: {
        rawValue: previousRawValue,
        value: previousValue,
      },
      current: {
        rawValue: currentRawValue,
        value: currentValue,
      },
    };
  });
}

export function getRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): FormValue<R, UserTypes> {
  return (formGroup.root as any)[rootFormInitialValue];
}

export function getFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): FormValue<T, UserTypes> {
  const path: string[] | null = getFormPath(formGroup);
  const rootInitialValue = getRootFormInitialValue<T, UserTypes>(formGroup);
  if (!path) {
    return rootInitialValue;
  }
  return getNestedValue(rootInitialValue, path);
}


/**
 * helpers
 */

function ensureSignal<W extends T[R], T extends object = any, R extends keyof T = any>(obj: T, key: R | symbol): WritableSignal<W> {
  if (obj && key && !isSignal(obj[key as unknown as R])) {
    obj[key as unknown as R] = signal(obj[key as unknown as R]) as W;
  }
  return obj[key as unknown as R] as WritableSignal<W>;
}

function getFormPath(control: AbstractControl): string[] | null {
  const root: AbstractControl<any, any> = control.root;
  if (root === control) {
    return null;
  }

  const path: string[] = [];

  function search(current: AbstractControl, currentPath: string[]): boolean {
    if (current === control) {
      path.push(...currentPath);
      return true;
    }

    if (current instanceof FormGroup) {
      for (const key of Object.keys(current.controls)) {
        const child = current.controls[key];
        if (search(child, [...currentPath, key])) {
          return true;
        }
      }
    }

    if (current instanceof FormArray) {
      for (let i = 0; i < current.length; i++) {
        const child = current.at(i);
        if (search(child, [...currentPath, i.toString()])) {
          return true;
        }
      }
    }

    return false;
  }

  return search(root, []) ? path : null;
}

export function getNestedValue(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj) ?? {};
}



/**
 * Symbols
 */
const rootFormValueChanges: unique symbol = Symbol('rootFormValueChanges');
const rootFormInitialValue: unique symbol = Symbol('rootFormInitialValue');
