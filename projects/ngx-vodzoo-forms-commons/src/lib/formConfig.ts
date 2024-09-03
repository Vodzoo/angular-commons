import {AbstractControl, FormGroup} from "@angular/forms";
import {FormControlsConfig, FormFieldConfigFn} from "./directives/form-config.directive";
import {FormValue} from "./directives/form.directive";

export function setConfig<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes>(formGroup: FormGroup<T>, config: FormControlsConfig<T, UserConfig, UserTypes>): void {
  (formGroup as any)[formConfig] = config;
}

export function setDefaultConfig<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes>(formGroup: FormGroup<T>, config: FormControlsConfig<T, UserConfig, UserTypes>): void {
  (formGroup as any)[defaultFormConfig] = config;
}

export function getConfig<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes>(formGroup: FormGroup<T>): FormControlsConfig<T, UserConfig, UserTypes> {
  return (formGroup as any)[formConfig];
}

export function getDefaultConfig<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes>(formGroup: FormGroup<T>): FormControlsConfig<T, UserConfig, UserTypes> {
  return (formGroup as any)[defaultFormConfig];
}

export function getConfigField<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes, UserConfig>(formGroup: FormGroup<T>, key: Paths<FormValue<T, UserTypes>, UserTypes>): UserConfig {
  const splitKeys: string[] = key.split('.');
  const form: FormGroup = formGroup.get(splitKeys)?.parent as FormGroup;
  const defaultConfig: FormControlsConfig<T, UserConfig, UserTypes> = getDefaultConfig(form);
  const config: FormControlsConfig<T, UserConfig, UserTypes> = getConfig(form);
  const defaultFieldConfigFn: FormFieldConfigFn<any, UserConfig, UserTypes> | undefined = (defaultConfig as any)[splitKeys[splitKeys.length - 1]];
  const fieldConfigFn: FormFieldConfigFn<any, UserConfig, UserTypes> | undefined = (config as any)[splitKeys[splitKeys.length - 1]];
  return typeof fieldConfigFn === 'function' ? fieldConfigFn(form, defaultFieldConfigFn?.(form, {}) ?? {}) ?? {} as UserConfig : {} as UserConfig;
}

const formConfig: unique symbol = Symbol('formConfig');
const defaultFormConfig: unique symbol = Symbol('defaultFormConfig');

export type Paths<T, UserTypes> = T extends Array<infer U>
  ? `${Paths<U, UserTypes>}`
  : T extends UserTypes
    ? never
    : T extends object
      ? {
        [K in keyof T & (string | number)]: K extends string
          ? `${K}` | `${K}.${Paths<T[K], UserTypes>}`
          : never;
      }[keyof T & (string | number)]
      : never;
