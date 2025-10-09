import {AbstractControl, FormGroup} from "@angular/forms";
import {FormValue, ValueChanges} from "./directives/form.directive";

export function setValues<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  (formGroup.root as any)[formValues] = values;
}

export function setInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: FormValue<T, UserTypes>): void {
  (formGroup.root as any)[initialFormValue] = values;
}

export function getValues<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): ValueChanges<T, UserTypes> {
  return (formGroup.root as any)[formValues];
}

export function getInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): FormValue<T, UserTypes> {
  return (formGroup.root as any)[initialFormValue];
}

const formValues: unique symbol = Symbol('formValues');
const initialFormValue: unique symbol = Symbol('initialFormValue');
