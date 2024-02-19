import {DestroyRef, Directive, inject, Input, OnInit} from '@angular/core';
import {AbstractControl, FormGroup} from "@angular/forms";
import {FormDirective, FormRawValue} from "./form.directive";
import {FormService} from "../services/form.service";
import {BehaviorSubject, Observable, startWith, tap} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Directive({
  selector: '[vodzooFormConfig]',
  exportAs: 'vodzooFormConfig',
  standalone: true
})
export class FormConfigDirective<T extends { [K in keyof T]: AbstractControl }, UserTypes> implements OnInit {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private formService: FormService<T, UserTypes> = inject(FormService<T, UserTypes>);
  private formDirective: FormDirective<T, UserTypes> = inject(FormDirective<T, UserTypes>);
  private destroyRef: DestroyRef = inject(DestroyRef);




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private _defaultFormFieldsConfig: FormControlsConfig<T, UserTypes> = this.formService.getFormFieldsConfig();
  private _formControlsConfig: FormControlsConfig<T, UserTypes> = this._defaultFormFieldsConfig;
  private _formControlsConfigChange$: BehaviorSubject<FormControlsConfigChange<T, UserTypes>> = new BehaviorSubject<FormControlsConfigChange<T, UserTypes>>(this.mapConfigToChange(this._formControlsConfig));
  private _controlsConfig$: BehaviorSubject<FormControlsConfig<T, UserTypes>> = new BehaviorSubject<FormControlsConfig<T, UserTypes>>(this._formControlsConfig);
  public readonly controlsConfig: Observable<FormControlsConfig<T, UserTypes>> = this._controlsConfig$.asObservable();
  public readonly controlsConfigChange: Observable<FormControlsConfigChange<T, UserTypes>> = this._formControlsConfigChange$.asObservable();




  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input()
  public set formControlsConfig(value: FormControlsConfig<T, UserTypes> | undefined) {
    this._formControlsConfig = !value || Object.keys(value).length === 0 ? this._defaultFormFieldsConfig : value;
    this.setConfig(this._formControlsConfig);
    this.setConfigChange(this.mapConfigToChange(value));
  }




  /**
   * ------------------------------------
   * Getters
   * ------------------------------------
   */
  public get controlsConfigChangeValue(): FormControlsConfigChange<T, UserTypes> {
    return this._formControlsConfigChange$.value;
  }

  public get controlsConfigValue(): FormControlsConfig<T, UserTypes> {
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
        this.setConfigChange(this.mapConfigToChange(this._formControlsConfig));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }




  /**
   * ------------------------------------
   * Other methods
   * ------------------------------------
   */
  private mapConfigToChange(value: FormControlsConfig<T, UserTypes> | undefined): FormControlsConfigChange<T, UserTypes> {
    const mergedConfig: FormControlsConfig<T, UserTypes> = {...this._defaultFormFieldsConfig, ...value};
    const change: FormControlsConfigChange<T, UserTypes> = {};
    Object.keys(mergedConfig).forEach((key: string) => {
      if ((typeof (mergedConfig as any)[key]) === 'function') {
        (change as any)[key] = ((mergedConfig as any)[key] as FormFieldConfigFn<T, any>)(this.formDirective.form, this.formDirective.formIndex);
      }
    })
    return change;
  }

  private setConfigChange(value: FormControlsConfigChange<T, UserTypes>): void {
    this._formControlsConfigChange$.next(value);
  }

  private setConfig(value: FormControlsConfig<T, UserTypes>): void {
    this._controlsConfig$.next(value);
  }
}




/**
 * ------------------------------------
 * Types
 * ------------------------------------
 */
export type FormControlsConfig<T, UserTypes> = RecursivePartialFormFieldConfig<FormRawValue<T>, UserTypes>;
type AllowedTypes<UserTypes> = boolean | string | number | undefined | null | UserTypes;
type RecursivePartialFormFieldConfig<T, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigArray<U, UserTypes> : ValueFormFieldConfig<T[P], UserTypes>;
};

type ValueFormFieldConfig<T, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, any> : RecursivePartialFormFieldConfig<T, UserTypes>;
type ValueFormFieldConfigArray<T, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, any> : RecursivePartialFormFieldConfig<T, UserTypes>;
export type FormFieldConfigFn<T extends { [K in keyof T]: AbstractControl<any, any>; }, R> = (control: FormGroup<T>, index?: number) => R;


export type FormControlsConfigChange<T, UserTypes> = RecursivePartialFormFieldConfigChange<FormRawValue<T>, UserTypes>;
type RecursivePartialFormFieldConfigChange<T, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigChange<U, UserTypes> : ValueFormFieldConfigChange<T[P], UserTypes>;
};
type ValueFormFieldConfigChange<T, UserTypes> = T extends AllowedTypes<UserTypes> ? any : RecursivePartialFormFieldConfigChange<T, UserTypes>;
