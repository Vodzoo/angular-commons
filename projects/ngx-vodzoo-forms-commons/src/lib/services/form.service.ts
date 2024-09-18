import {inject, Injectable, InjectionToken, OnDestroy} from '@angular/core';
import {AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidatorFn} from '@angular/forms';
import {
  FormDisabledState,
  FormValidators,
  FormValue,
  FormValues
} from '../directives/form.directive';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {markAsUiChange} from "../directives/form-field.directive";
import {FormControlsConfig, FormFieldConfigFn, FormControlsLogic} from "../directives/form-config.directive";
import {setConfig, setDefaultConfig} from "../formConfig";
import {mergeDeep} from "../mergeDeep";

export const STORAGE: InjectionToken<Storage> = new InjectionToken<Storage>('storage', {
  factory: () => sessionStorage
});

export const DEFAULT_FORM_SERVICE_CONFIG: FormServiceConfig = {
  storageSaveOn: ['userChange']
} as const;

export const FORM_SERVICE_CONFIG: InjectionToken<FormServiceConfig> = new InjectionToken<FormServiceConfig>('FORM_SERVICE_CONFIG', {
  factory: () => DEFAULT_FORM_SERVICE_CONFIG
});

export interface FormServiceConfig {
  storageSaveOn: ReadonlyArray<StorageSaveOn>;
}

export type StorageSaveOn = 'userChange' | 'nonUserChange' | 'dataChange' | 'rawDataChange';

@Injectable()
export class FormService<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> implements OnDestroy {

  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   */


  protected fb: FormBuilder = inject(FormBuilder);
  private storage: Storage = inject(STORAGE);
  private formServiceConfig: FormServiceConfig = inject(FORM_SERVICE_CONFIG);




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */


  public defaultComponentId: string = '';
  public initialValue?: FormValue<T, UserTypes> | null;
  public initialDisabledState?: FormDisabledState<T, UserTypes> | null;
  public initialValidators?: FormValidators<T, UserTypes> | null;
  /**
   * for internal use only
   */
  public readonly recalculateMethods: Array<(service?: FormService<any, any, any>) => void> = [];
  public readonly recalculateConfig = () => {
    this.recalculateMethods.forEach(method => method());
  };
  protected saveInStorage: boolean = true;
  protected removeFromStorageOnDestroy: boolean = true;
  private formValues: Map<string, FormValues<T, UserTypes>> = new Map();
  private patchFormValue: Subject<{componentId: string, value: FormValue<T, UserTypes>}> = new Subject();
  private formValuesChanges$: BehaviorSubject<Map<string, FormValues<T, UserTypes>>> = new BehaviorSubject(this.formValues);




  /**
   * ------------------------------------
   * Lifecycle hooks
   * ------------------------------------
   */


  public ngOnDestroy(): void {
    if (this.removeFromStorageOnDestroy) {
      [...this.formValues.keys()].forEach(key => this.storage.removeItem(key));
    }
    this.recalculateMethods.length = 0;
  }




  /**
   * ------------------------------------
   * Methods
   * ------------------------------------
   */


  public getFormValues(componentId: string = this.defaultComponentId): FormValues<T, UserTypes> | undefined {
    const valuesFromMap: FormValues<T, UserTypes> | undefined = this.formValues.get(componentId);
    if (valuesFromMap) {
      return valuesFromMap;
    }

    const storageString: string | null = this.storage.getItem(componentId);
    const valuesFromStorage: FormValues<T, UserTypes> | undefined = storageString ? JSON.parse(storageString) : undefined;
    if (valuesFromStorage) {
      this.setFormValues(valuesFromStorage, componentId, false);
    }
    return valuesFromStorage;
  }


  public get formValueChangesValue(): ReadonlyMap<string, FormValues<T, UserTypes>> {
    return this.formValuesChanges$.value;
  }


  public get formValuesChanges(): Observable<ReadonlyMap<string, FormValues<T, UserTypes>>> {
    return this.formValuesChanges$.asObservable();
  }


  public get patchFormValueChanges(): Observable<{componentId: string, value: FormValue<T, UserTypes>}> {
    return this.patchFormValue.asObservable();
  }


  public setFormValues(formValues: FormValues<T, UserTypes>,
                       componentId: string = this.defaultComponentId,
                       saveInStorage: boolean = this.saveInStorage,
                       storageSaveAs: ReadonlyArray<StorageSaveOn> = this.formServiceConfig.storageSaveOn,
                       emitEvent: boolean = true): void {
    this.formValues.set(componentId, formValues);
    if (emitEvent) {
      this.formValuesChanges$.next(this.formValues);
    }
    if (saveInStorage) {
      const configStorageSaveOn: ReadonlyArray<StorageSaveOn> = this.formServiceConfig.storageSaveOn;
      if (configStorageSaveOn.some(configSave => storageSaveAs.includes(configSave))) {
        this.storage.setItem(componentId, JSON.stringify(formValues));
      }
    }
  }


  public patchForm(value: FormValue<T, UserTypes>, formIndex?: number): void {
    this.patchFormValue.next({
      componentId: `${this.defaultComponentId}${formIndex ?? ''}`,
      value
    })
  }


  public getFormGroup(
    initialValue?: FormValue<T, UserTypes> | null,
    initialDisabledState?: FormDisabledState<T, UserTypes> | null,
    initialValidators?: FormValidators<T, UserTypes> | null,
    index?: number | null
  ): FormGroup<T> {
    const hasInitialValue: boolean = !!initialValue || !!this.initialValue;
    const hasInitialDisableState: boolean = !!initialDisabledState || !!this.initialDisabledState;
    const hasInitialValidators: boolean = !!initialValidators || !!this.initialValidators;
    const fg: FormGroup<T> = this.fromGroupConfig(
      hasInitialValue ? {...this.initialValue, ...initialValue} : undefined,
      hasInitialDisableState ? {...this.initialDisabledState, ...initialDisabledState} : undefined,
      hasInitialValidators ? {...this.initialValidators, ...initialValidators} : undefined,
      index
    );
    setDefaultConfig(fg, this.formFieldsConfig());
    setConfig(fg, this.formFieldsConfig());
    return fg;
  }


  public getFormFieldsConfig(): FormControlsConfig<T, UserConfig, UserTypes> {
    return this.formFieldsConfig();
  }


  public getFormFieldsLogic(): FormControlsLogic<T, UserConfig, UserTypes> {
    return this.formFieldsLogic();
  }


  public mergeConfigWith(newConfig: FormControlsConfig<T, UserConfig, UserTypes>, opts?: { mergeArrays?: boolean; }): FormControlsConfig<T, UserConfig, UserTypes> {
    const defaultConfig: FormControlsConfig<T, UserConfig, UserTypes> = this.getFormFieldsConfig();
    const mergedConfig: FormControlsConfig<T, UserConfig, UserTypes> = {};

    Object.keys(defaultConfig).forEach(key => {
      const defaultValue: FormFieldConfigFn<T, UserConfig, UserTypes> | object | undefined = (defaultConfig as any)[key];
      const newValue: FormFieldConfigFn<T, UserConfig, UserTypes> | object | undefined = (newConfig as any)[key];
      if (!newValue) {
        (mergedConfig as any)[key] = defaultValue;
      } else if (typeof defaultValue === 'function' && typeof newValue === 'function') {
        const mergedFn: FormFieldConfigFn<T, UserConfig, UserTypes> = (control: FormGroup<T>, config: any, index?: number): any => {
          const defaultFieldConfig = defaultValue(control, config, index) ?? {};
          const newFieldConfig = newValue(control, config, index) ?? {};
          return mergeDeep(defaultFieldConfig, newFieldConfig, opts);
        };
        (mergedConfig as any)[key] = mergedFn;
      } else {
        (mergedConfig as any)[key] = newValue;
      }
    })
    return mergedConfig;
  }


  public mergeLogicWith(newLogic: FormControlsLogic<T, UserConfig, UserTypes>): FormControlsLogic<T, UserConfig, UserTypes> {
    const defaultLogic: FormControlsLogic<T, UserConfig, UserTypes> = this.getFormFieldsLogic();
    return mergeDeep(defaultLogic, newLogic);
  }


  protected fromGroupConfig(
    initialValue?: FormValue<T, UserTypes> | null,
    initialDisabledState?: FormDisabledState<T, UserTypes> | null,
    initialValidators?: FormValidators<T, UserTypes> | null,
    index?: number | null
  ): FormGroup<T> {
    throw new Error('From group config not implemented!');
  }


  protected formFieldsConfig(): FormControlsConfig<T, UserConfig, UserTypes> {
    console.warn('NYI, returning empty config!')
    return {};
  }


  protected formFieldsLogic(): FormControlsLogic<T, UserConfig, UserTypes> {
    return {};
  }


  /**
   * Utility methods
   */


  public addGroup(
    formArray: FormArray<FormGroup<T>>,
    initialValue?: FormValue<T, UserTypes> | null,
    initialDisabledState?: FormDisabledState<T, UserTypes> | null,
    initialValidators?: FormValidators<T, UserTypes> | null
  ): FormGroup<T> {
    markAsUiChange(formArray);
    const control: FormGroup<T> = this.getFormGroup(initialValue, initialDisabledState, initialValidators);
    formArray.push(control);
    return control;
  }

  public addNullableControl<R>(
    formArray: FormArray<FormControl<NonNullable<R> | null>>,
    initialValue?: NonNullable<R> | null,
    initialDisabledState?: boolean | null,
    initialValidators?: ValidatorFunctions
  ): FormControl<NonNullable<R> | null> {
    markAsUiChange(formArray);
    const control: FormControl<NonNullable<R> | null> = this.createNullableFormControl(initialValue, initialDisabledState, initialValidators);
    formArray.push(control);
    return control;
  }

  public addNonNullableControl<R>(
    formArray: FormArray<FormControl<NonNullable<R>>>,
    initialValue: NonNullable<R>,
    initialDisabledState?: boolean | null,
    initialValidators?: ValidatorFunctions
  ): FormControl<NonNullable<R>> {
    markAsUiChange(formArray);
    const control: FormControl<NonNullable<R>> = this.createNonNullableFormControl(initialValue, initialDisabledState, initialValidators);
    formArray.push(control);
    return control;
  }


  public removeFromArray<R extends AbstractControl<S>, S>(
    formArray: FormArray<R>,
    control: R
  ): void {
    markAsUiChange(formArray);
    formArray.removeAt(formArray.controls.indexOf(control));
  }


  protected createNullableFormControl<R>(
    initialValue?: R | null | undefined,
    initialDisabledState?: boolean | null,
    initialValidators?: ValidatorFunctions
  ): FormControl<R | null> {
    return this.createFormControl(initialValue ?? null, !!initialDisabledState, initialValidators, false);
  }


  protected createNonNullableFormControl<R>(
    initialValue: R,
    initialDisabledState?: boolean | null,
    initialValidators?: ValidatorFunctions
  ): FormControl<R> {
    return this.createFormControl(initialValue, !!initialDisabledState, initialValidators, true);
  }


  private createFormControl<R>(
    value: R,
    disabled: boolean,
    validators?: ValidatorFunctions,
    nonNullable?: boolean
  ): FormControl<R> {
    return this.fb.control({value, disabled}, {validators, nonNullable}) as FormControl<R>;
  }
}


/**
 * Types
 */
export type ValidatorFunctions = ValidatorFn[];
export type Nullable<T> = T | null | undefined;
