import {DestroyRef, Directive, inject, InjectionToken, Input, OnDestroy, OnInit} from '@angular/core';
import {AbstractControl, FormGroup} from "@angular/forms";
import {FormDirective, FormRawValue} from "./form.directive";
import {FormService} from "../services/form.service";
import {BehaviorSubject, Observable, startWith, tap} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";


export const RECALCULATE_CONFIG: InjectionToken<readonly RecalculateConfig[]> = new InjectionToken<readonly RecalculateConfig[]>('RECALCULATE_CONFIG');

export interface RecalculateConfig {
  registerRecalculate(fn: (service?: FormService<any, any, any>) => void): void;
}

@Directive({
  selector: '[vodzooFormConfig]',
  exportAs: 'vodzooFormConfig',
  standalone: true
})
export class FormConfigDirective<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> implements OnInit, OnDestroy {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private formService: FormService<T, UserConfig, UserTypes> = inject(FormService<T, UserConfig, UserTypes>);
  private formDirective: FormDirective<T, UserConfig, UserTypes> = inject(FormDirective<T, UserConfig, UserTypes>);
  private destroyRef: DestroyRef = inject(DestroyRef);

  constructor() {
    this.formService.recalculateMethods.push(this.recalculateConfig);
    inject(RECALCULATE_CONFIG, {optional: true})?.forEach(rc => rc.registerRecalculate(this.recalculateConfig));
  }


  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private _defaultFormFieldsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this.formService.getFormFieldsConfig();
  private _defaultFormFieldsConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
  private _formControlsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this._defaultFormFieldsConfig;
  private _formControlsConfigChange$: BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>>(this.mapConfigToChange(this._formControlsConfig));
  private _controlsConfig$: BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>>(this._formControlsConfig);
  public readonly controlsConfig: Observable<FormControlsConfig<T, UserConfig, UserTypes>> = this._controlsConfig$.asObservable();
  public readonly controlsConfigChange: Observable<FormControlsConfigChange<T, UserConfig, UserTypes>> = this._formControlsConfigChange$.asObservable();
  public readonly recalculateConfig = (service?: FormService<any, any, any>) => {
    if (service && service !== this.formService) {
      return;
    }
    this.formControlsConfig = this._formControlsConfig;
  }





  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input()
  public set formControlsConfig(value: FormControlsConfig<T, UserConfig, UserTypes> | undefined) {
    this._formControlsConfig = !value || Object.keys(value).length === 0 ? this._defaultFormFieldsConfig : value;
    this.setConfig(this._formControlsConfig);
    this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
    this.setConfigChange(this.mapConfigToChange(value));
  }




  /**
   * ------------------------------------
   * Getters
   * ------------------------------------
   */
  public get controlsConfigChangeValue(): FormControlsConfigChange<T, UserConfig, UserTypes> {
    return this._formControlsConfigChange$.value;
  }

  public get controlsConfigValue(): FormControlsConfig<T, UserConfig, UserTypes> {
    return this._controlsConfig$.value;
  }




  /**
   * ------------------------------------
   * Lifecycle hooks
   * ------------------------------------
   */
  public ngOnInit(): void {
    this.formDirective.form.valueChanges.pipe(
      startWith(this.formDirective.form.value),
      tap(() => {
        this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
        this.setConfigChange(this.mapConfigToChange(this._formControlsConfig));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  public ngOnDestroy(): void {
    const methods = this.formService.recalculateMethods.filter(method => method !== this.recalculateConfig);
    this.formService.recalculateMethods.length = 0;
    this.formService.recalculateMethods.push(...methods);
  }




  /**
   * ------------------------------------
   * Other methods
   * ------------------------------------
   */
  private mapConfigToChange(value: FormControlsConfig<T, UserConfig, UserTypes> | undefined): FormControlsConfigChange<T, UserConfig, UserTypes> {
    const mergedConfig: FormControlsConfig<T, UserConfig, UserTypes> = {...this._defaultFormFieldsConfig, ...value};
    const change: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
    Object.keys(mergedConfig).forEach((key: string) => {
      if ((typeof (mergedConfig as any)[key]) === 'function') {
        (change as any)[key] = ((mergedConfig as any)[key] as FormFieldConfigFn<T, any, any>)(this.formDirective.form, this._defaultFormFieldsConfigChange, this.formDirective.formIndex);
      }
    })
    return change;
  }

  private setConfigChange(value: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    this._formControlsConfigChange$.next(value);
  }

  private setConfig(value: FormControlsConfig<T, UserConfig, UserTypes>): void {
    this._controlsConfig$.next(value);
  }
}




/**
 * ------------------------------------
 * Types
 * ------------------------------------
 */
export type FormControlsConfig<T, UserConfig, UserTypes> = RecursivePartialFormFieldConfig<FormRawValue<T>, UserConfig, UserTypes>;
type AllowedTypes<UserTypes> = boolean | string | number | undefined | null | UserTypes;
type RecursivePartialFormFieldConfig<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigArray<U, UserConfig, UserTypes> : ValueFormFieldConfig<T[P], UserConfig, UserTypes>;
};

type ValueFormFieldConfig<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, UserConfig, UserTypes> : RecursivePartialFormFieldConfig<T, UserConfig, UserTypes>;
type ValueFormFieldConfigArray<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, UserConfig, UserTypes> : RecursivePartialFormFieldConfig<T, UserConfig, UserTypes>;
export type FormFieldConfigFn<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes> = (control: FormGroup<T>, defaultConfig: FormControlsConfigChange<T, UserConfig, UserTypes>, index?: number) => UserConfig;


export type FormControlsConfigChange<T, UserConfig, UserTypes> = RecursivePartialFormFieldConfigChange<FormRawValue<T>, UserConfig, UserTypes>;
type RecursivePartialFormFieldConfigChange<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigChange<U, UserConfig, UserTypes> : ValueFormFieldConfigChange<T[P], UserConfig, UserTypes>;
};
type ValueFormFieldConfigChange<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? UserConfig : RecursivePartialFormFieldConfigChange<T, UserConfig, UserTypes>;
