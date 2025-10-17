import {computed, inject, Injectable, InjectionToken, OnDestroy, Signal} from '@angular/core';
import {AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidatorFn} from '@angular/forms';
import {
  FormDisabledState,
  FormValidators,
  FormValue,
  FormValues
} from '../directives/form.directive';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {markAsUiChange} from "../directives/form-field.directive";
import {
  FormControlsConfig,
  FormFieldConfigFn,
  FormControlsLogic,
  FormControlsLogic2
} from "../directives/form-config.directive";
import {setConfig, setDefaultConfig} from "../formConfig";
import {MERGE_CONFIG, MergeConfig, mergeDeep} from "../mergeDeep";

export const STORAGE: InjectionToken<Storage> = new InjectionToken<Storage>('storage', {
  factory: () => sessionStorage
});

export const DEFAULT_FORM_SERVICE_CONFIG: FormServiceConfig = {
  storageSaveOn: ['userChange'],
  parserFn: JSON.parse,
} as const;

export const FORM_SERVICE_CONFIG: InjectionToken<FormServiceConfig> = new InjectionToken<FormServiceConfig>('FORM_SERVICE_CONFIG', {
  factory: () => DEFAULT_FORM_SERVICE_CONFIG
});

export interface FormServiceConfig {
  storageSaveOn: ReadonlyArray<StorageSaveOn>;
  parserFn: (text: string) => any;
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
  private readonly storage: Storage = inject(STORAGE);
  private readonly formServiceConfig: FormServiceConfig = inject(FORM_SERVICE_CONFIG);
  private readonly mergeConfig: MergeConfig = inject(MERGE_CONFIG);




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
  private readonly formValues: Map<string, FormValues<T, UserTypes>> = new Map();
  private readonly patchFormValue: Subject<{componentId: string, value: FormValue<T, UserTypes>}> = new Subject();
  private readonly formValuesChanges$: BehaviorSubject<Map<string, FormValues<T, UserTypes>>> = new BehaviorSubject(this.formValues);


  /**
   * Signals
   */

    // return different object/value (must resolve to true) every time config needs to be recalculated eg.
    // public reloadConfigSignals: Signal<any> = computed((): any => {
    //     return [this.mySignal()];
    //   });
  public reloadConfigSignals: Signal<any> = computed((): any => {
    return false;
  });
  public reloadLogicSignals: Signal<any> = computed((): any => {
    return false;
  });


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

  public clearData(opts?: ClearDataOptions): void {
    if (!opts?.skipStorage) {
      [...this.formValues.keys()].forEach(key => this.storage.removeItem(key));
    }
    if (!opts?.skipService) {
      this.formValues.clear();
      this.formValuesChanges$.next(this.formValues);
    }
  }

  public getFormValues(componentId: string = this.defaultComponentId): FormValues<T, UserTypes> | undefined {
    const valuesFromMap: FormValues<T, UserTypes> | undefined = this.formValues.get(componentId);
    if (valuesFromMap) {
      return valuesFromMap;
    }

    const storageString: string | null = this.storage.getItem(componentId);
    const valuesFromStorage: FormValues<T, UserTypes> | undefined = storageString ? this.formServiceConfig.parserFn(storageString) : undefined;
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


  /**
   * @deprecated Use getFormFieldsLogic2 with formFieldsLogic2() and input [formControlsLogic2]
   */
  public getFormFieldsLogic(): FormControlsLogic<T, UserConfig, UserTypes> {
    return this.formFieldsLogic();
  }


  public getFormFieldsLogic2(): FormControlsLogic2<T, UserConfig, UserTypes> {
    return this.formFieldsLogic2();
  }


  public mergeInitialValueWith(newValue: FormValue<T, UserTypes>, opts?: { mergeArrays?: boolean; skipMerging?: (target: any, source: any) => boolean }): FormValue<T, UserTypes> {
    const defaultValue: FormValue<T, UserTypes> = this.getFormGroup().getRawValue();
    return mergeDeep(defaultValue, newValue, {...this.mergeConfig, ...opts});
  }


  public mergeConfigWith(newConfig: FormControlsConfig<T, UserConfig, UserTypes>, opts?: { mergeArrays?: boolean; skipMerging?: (target: any, source: any) => boolean }, key?: string): FormControlsConfig<T, UserConfig, UserTypes> {
    const defaultConfig: FormControlsConfig<T, UserConfig, UserTypes> = key ? ((this.getFormFieldsConfig() as any)[key] ?? {}) : this.getFormFieldsConfig();
    const mergedConfig: FormControlsConfig<T, UserConfig, UserTypes> = defaultConfig;

    Object.keys(newConfig).forEach(key => {
      const defaultValue: FormFieldConfigFn<T, UserConfig, UserTypes> | object | undefined = (defaultConfig as any)[key];
      const newValue: FormFieldConfigFn<T, UserConfig, UserTypes> | object | undefined = (newConfig as any)[key];
      if (!defaultValue) {
        (mergedConfig as any)[key] = newValue;
      } else if (typeof defaultValue === 'function' && typeof newValue === 'function') {
        const mergedFn: FormFieldConfigFn<T, UserConfig, UserTypes> = (control: FormGroup<T>, config: any, index?: number): any => {
          const defaultFieldConfig = defaultValue(control, config, index) ?? {};
          const newFieldConfig = newValue(control, config, index) ?? {};
          return mergeDeep(defaultFieldConfig, newFieldConfig, {...this.mergeConfig, ...opts});
        };
        (mergedConfig as any)[key] = mergedFn;
      } else {
        (mergedConfig as any)[key] = this.mergeConfigWith(newValue as object, opts, key);
      }
    })
    return mergedConfig;
  }


  /**
   * @deprecated Use mergeLogic2With with getFormFieldsLogic2
   */
  public mergeLogicWith(newLogic: FormControlsLogic<T, UserConfig, UserTypes>): FormControlsLogic<T, UserConfig, UserTypes> {
    const defaultLogic: FormControlsLogic<T, UserConfig, UserTypes> = this.getFormFieldsLogic();
    return mergeDeep(defaultLogic, newLogic);
  }


  /**
   * Example:
   * ```ts
   * protected override formFieldsLogic2(): FormControlsLogic2<PersonBase, any, Date> {
   *     return {
   *       address: this.formAddressService.mergeLogic2With({
   *         country: (spec) => {
   *           this.formAddressService.getFormFieldsLogic2().country?.(spec); // run all logic from formAddressService
   *
   *           const onInitFn: FormFieldLogic2FnSpecArgsFn<Address, any, Date> = ({form, index, config}) => { // INIT LOGIC }
   *
   *           const onValueChangeFn: FormFieldLogic2FnSpecArgsFn<Address, any, Date> = ({form, index, config}): FormFieldLogic2FnState | void => {
   *             if (form.controls.country.value === '12') {
   *               return {
   *                 stopExecution: true,
   *               }
   *             }
   *           }
   *
   *           spec.onInit?.(onInitFn);
   *           spec.onValueChange?.(onValueChangeFn); // logic will stop when form.controls.country.value === '12'
   *         },
   *         voivodeship: ({ onInit, onDestroy, onValueChange, onConfigChange, onLogicRecalculate }) => {
   *           this.formAddressService.getFormFieldsLogic2().voivodeship?.({onValueChange, onConfigChange, onLogicRecalculate}); // no onInit and onDestroy logic will be triggered from formAddressService
   *           onInit?.(({form}) => console.log(form));
   *           this.formAddressService.getFormFieldsLogic2().voivodeship?.({onInit}); // only onInit logic will be triggered from formAddressService
   *         },
   *       }),
   *     };
   *   }
   *   ```
   */
  public mergeLogic2With(newLogic: FormControlsLogic2<T, UserConfig, UserTypes>): FormControlsLogic2<T, UserConfig, UserTypes> {
    const defaultLogic: FormControlsLogic2<T, UserConfig, UserTypes> = this.getFormFieldsLogic2();
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
    return {};
  }


  /**
   * @deprecated Use formFieldsLogic2() with input [formControlsLogic2]
   * @protected
   */
  protected formFieldsLogic(): FormControlsLogic<T, UserConfig, UserTypes> {
    return {};
  }


  protected formFieldsLogic2(): FormControlsLogic2<T, UserConfig, UserTypes> {
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
 * Types / Interfaces
 */
export type ValidatorFunctions = ValidatorFn[];
export type Nullable<T> = T | null | undefined;
export interface ClearDataOptions {
  skipStorage?: boolean;
  skipService?: boolean;
}
