import {AbstractControl, FormGroup} from "@angular/forms";
import {FormValue, ValueChanges} from "./directives/form.directive";

export function setRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  (formGroup.root as any)[rootFormValueChanges] = values;
}

export function setRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: FormValue<T, UserTypes>): void {
  (formGroup.root as any)[rootFormInitialValue] = values;
}

export function getRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): ValueChanges<R, UserTypes> {
  return (formGroup.root as any)[rootFormValueChanges];
}

export function getRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): FormValue<R, UserTypes> {
  return (formGroup.root as any)[rootFormInitialValue];
}

const rootFormValueChanges: unique symbol = Symbol('rootFormValueChanges');
const rootFormInitialValue: unique symbol = Symbol('rootFormInitialValue');
