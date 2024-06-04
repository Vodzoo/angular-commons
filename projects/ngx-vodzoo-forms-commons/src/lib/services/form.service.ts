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
import {FormControlsConfig} from "../directives/form-config.directive";

export const STORAGE: InjectionToken<Storage> = new InjectionToken<Storage>('storage', {
  factory: () => sessionStorage
});

@Injectable()
export class FormService<T extends { [K in keyof T]: AbstractControl }, UserTypes> implements OnDestroy {

  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   */


  protected fb: FormBuilder = inject(FormBuilder);
  private storage: Storage = inject(STORAGE);




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */


  public defaultComponentId: string = '';
  public initialValue?: FormValue<T, UserTypes> | null;
  public initialDisabledState?: FormDisabledState<T, UserTypes> | null;
  public initialValidators?: FormValidators<T, UserTypes> | null;
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


  public setFormValues(formValues: FormValues<T, UserTypes>, componentId: string = this.defaultComponentId, saveInStorage: boolean = this.saveInStorage, emitEvent: boolean = true): void {
    this.formValues.set(componentId, formValues);
    if (emitEvent) {
      this.formValuesChanges$.next(this.formValues);
    }
    if (saveInStorage) {
      this.storage.setItem(componentId, JSON.stringify(formValues));
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
    return this.fromGroupConfig(
      hasInitialValue ? {...this.initialValue, ...initialValue} : undefined,
      hasInitialDisableState ? {...this.initialDisabledState, ...initialDisabledState} : undefined,
      hasInitialValidators ? {...this.initialValidators, ...initialValidators} : undefined,
      index
    );
  }

  public getFormFieldsConfig(): FormControlsConfig<T, UserTypes> {
    return this.formFieldsConfig();
  }


  protected fromGroupConfig(
    initialValue?: FormValue<T, UserTypes> | null,
    initialDisabledState?: FormDisabledState<T, UserTypes> | null,
    initialValidators?: FormValidators<T, UserTypes> | null,
    index?: number | null
  ): FormGroup<T> {
    throw new Error('From group config not implemented!');
  }


  protected formFieldsConfig(): FormControlsConfig<T, UserTypes> {
    throw new Error('From fields config not implemented!');
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


  public removeGroup(
    formArray: FormArray<FormGroup<T>>,
    formGroup: FormGroup<T>
  ): void {
    markAsUiChange(formArray);
    formArray.removeAt(formArray.controls.indexOf(formGroup));
  }


  protected createFormArrayControl<R>(
    formControl: (initialValue?: R | null, initialDisabledState?: boolean | null, initialValidators?: ValidatorFunctions) => FormControl<R | null>,
    initialValue?: (R | null)[],
    initialDisabledState?: (boolean | null)[],
    initialValidators?: ValidatorFunctions[],
    initialSize: number = 1
  ): FormArray<FormControl<R | null>> {
    formControl = formControl.bind(this);
    return this.fb.array([...(initialValue ?? new Array(initialSize).fill(null)).map((value, index) => formControl(value, !!initialDisabledState?.[index], initialValidators?.[index]))]);
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
export type ValidatorFunctions = ValidatorFn | ValidatorFn[] | null;
export type Nullable<T> = T | null | undefined;
