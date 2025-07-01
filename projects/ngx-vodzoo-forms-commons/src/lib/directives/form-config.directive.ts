import {
  DestroyRef,
  Directive,
  effect,
  inject,
  InjectionToken,
  Input,
  OnDestroy,
  OnInit,
  output,
  untracked
} from '@angular/core';
import {AbstractControl, FormControlStatus, FormGroup} from "@angular/forms";
import {FormDirective, FormRawValue} from "./form.directive";
import {FormService} from "../services/form.service";
import {BehaviorSubject, debounceTime, distinctUntilChanged, Observable, tap} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {setConfig} from "../formConfig";
import {MERGE_CONFIG, MergeConfig, mergeDeep} from "../mergeDeep";


export const RECALCULATE_CONFIG: InjectionToken<readonly RecalculateConfig[]> = new InjectionToken<readonly RecalculateConfig[]>('RECALCULATE_CONFIG');

export interface RecalculateConfig {
  registerRecalculate(fn: (service?: FormService<any, any, any>) => void): void;
}

export const DEFAULT_FORM_CONFIGURATION_CONFIG: FormConfigurationConfig = {
  alwaysTrackConfigChange: true,
  equalFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
} as const;

export const FORM_CONFIGURATION_CONFIG: InjectionToken<FormConfigurationConfig> = new InjectionToken<FormConfigurationConfig>('FORM_CONFIGURATION_CONFIG', {
  factory: () => DEFAULT_FORM_CONFIGURATION_CONFIG
});

export interface FormConfigurationConfig {
  alwaysTrackConfigChange?: boolean;
  equalFn: (a: any, b: any) => boolean;
}


@Directive({
  selector: '[vFormConfig]',
  exportAs: 'vFormConfig',
  standalone: true
})
export class FormConfigDirective<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> implements OnInit, OnDestroy {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private readonly formService: FormService<T, UserConfig, UserTypes> = inject(FormService<T, UserConfig, UserTypes>);
  private readonly formDirective: FormDirective<T, UserConfig, UserTypes> = inject(FormDirective<T, UserConfig, UserTypes>);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly formConfigurationConfig: FormConfigurationConfig = inject(FORM_CONFIGURATION_CONFIG);
  private readonly mergeConfig: MergeConfig = inject(MERGE_CONFIG);

  constructor() {
    this.formService.recalculateMethods.push(this.recalculateConfig);
    inject(RECALCULATE_CONFIG, {optional: true})?.forEach(rc => rc.registerRecalculate(this.recalculateConfig));
  }




  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private readonly _defaultFormFieldsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this.formService.getFormFieldsConfig();
  private _defaultFormFieldsConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
  private readonly _defaultFormFieldLogic: FormControlsLogic<T, UserConfig, UserTypes> = this.formService.getFormFieldsLogic();
  private _formControlsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this._defaultFormFieldsConfig;
  private readonly _formControlsConfigChange$: BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>>(this.mapConfigToChange(this._formControlsConfig));
  private readonly _formFieldLogic: BehaviorSubject<FormControlsLogic<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsLogic<T, UserConfig, UserTypes>>(this._defaultFormFieldLogic);
  private readonly _controlsConfig$: BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>>(this._formControlsConfig);
  private _initialRecalculate: boolean = false;
  public readonly controlsConfig: Observable<FormControlsConfig<T, UserConfig, UserTypes>> = this._controlsConfig$.asObservable();
  public readonly controlsConfigChange: Observable<FormControlsConfigChange<T, UserConfig, UserTypes>> = this._formControlsConfigChange$.asObservable();
  public readonly controlsLogic: Observable<FormControlsLogic<T, UserConfig, UserTypes>> = this._formFieldLogic.asObservable();
  public readonly recalculateConfig = (service?: FormService<any, any, any>) => {
    if (service && service !== this.formService) {
      return;
    }
    this.formControlsConfig = this._formControlsConfig;
  }

  /**
   * Effects
   */

  private readonly reloadConfig = effect(() => {
    if (this.formService.reloadConfigSignals()) {
      untracked(() => {
        this.recalculateConfig();
      })
    }
  })

  private readonly reloadLogic = effect(() => {
    if (this.formService.reloadLogicSignals()) {
      untracked(() => {
        this.formControlsLogic = this._formFieldLogic.value;
      })
    }
  })



  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  @Input()
  public set formControlsConfig(value: FormControlsConfig<T, UserConfig, UserTypes> | undefined) {
    this._formControlsConfig = !value || Object.keys(value).length === 0 ? this._defaultFormFieldsConfig : value;
    this.setConfig(this._formControlsConfig);
    this.runLogic(this._formFieldLogic.value, this._initialRecalculate ? 'config' : 'init', 'beforeConfig');
    this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(value);
    const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
    this.runLogic(this._formFieldLogic.value, this._initialRecalculate ? 'config' : 'init', 'afterConfig', merged);
    this.setConfigChange(merged);
    this._initialRecalculate = true;
  }

  @Input()
  public set formControlsLogic(value: FormControlsLogic<T, UserConfig, UserTypes> | undefined) {
    this.setLogic(!value || Object.keys(value).length === 0 ? this._defaultFormFieldLogic : mergeDeep(this._defaultFormFieldLogic, value, { ...this.mergeConfig, immutable: true }));
    if (this._initialRecalculate) {
      this.runLogic(this._formFieldLogic.value, 'recalculate', 'none', this._formControlsConfigChange$.value);
    }
  }

  /**
   * Outputs
   */
  public configValue = output<FormControlsConfigChange<T, UserConfig, UserTypes>>();



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
    if (!this._initialRecalculate) {
      this._initialRecalculate = true;
      this.setConfig(this._formControlsConfig);
      this.runLogic(this._formFieldLogic.value, 'init', 'beforeConfig');
      this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
      const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
      const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._formControlsConfig);
      const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
      this.runLogic(this._formFieldLogic.value, 'init', 'afterConfig', merged);
      this.setConfigChange(merged);
    }
    if (!this.formConfigurationConfig.alwaysTrackConfigChange && Object.keys(this.controlsConfigChangeValue).length === 0) {
      return;
    }

    let status: FormControlStatus = this.formDirective.form.status;
    this.formDirective.form.valueChanges.pipe(
      debounceTime(0),
      distinctUntilChanged((prev, cur) => {
        const curStatus: FormControlStatus = this.formDirective.form.status;
        const statusChanged: boolean = curStatus !== status;
        if (statusChanged) {
          status = curStatus;
          return false;
        }
        if (prev === cur) {
          return true;
        }
        return this.formConfigurationConfig.equalFn(prev, cur);
      }),
      tap(() => {
        this.setConfig(this._formControlsConfig);
        this.runLogic(this._formFieldLogic.value, 'value', 'beforeConfig');
        this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
        const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
        const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._formControlsConfig);
        const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
        this.runLogic(this._formFieldLogic.value, 'value', 'afterConfig', merged);
        this.setConfigChange(merged);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    this.controlsConfigChange.pipe(
      tap(value => this.configValue.emit(value)),
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
    const mergedConfig: FormControlsConfig<T, UserConfig, UserTypes> = value !== this._defaultFormFieldsConfig ? {...this._defaultFormFieldsConfig, ...value} : value;
    const change: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
    Object.keys(mergedConfig).forEach((key: string) => {
      if ((typeof (mergedConfig as any)[key]) === 'function') {
        (change as any)[key] = ((mergedConfig as any)[key] as FormFieldConfigFn<T, any, any>)(this.formDirective.form, this._defaultFormFieldsConfigChange, this.formDirective.formIndex);
      }
    })
    return change;
  }

  private runLogic(logic: FormControlsLogic<T, UserConfig, UserTypes>, phase: LogicPhase, subphase: LogicSubphase, config?: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    Object.keys(logic).forEach((key: string) => {
      const fieldLogic: FormFieldLogic<T, UserConfig, UserTypes> = (logic as any)[key];
      switch (phase) {
        case 'init':
          this.initLogic(fieldLogic, subphase, config)
          break;
        case 'config':
          this.configChange(fieldLogic, subphase, config);
          break;
        case 'value':
          this.valueChange(fieldLogic, subphase, config);
          break;
        case 'recalculate':
          this.recalculateLogic(fieldLogic, config);
          break;
        default:
          break;
      }
    })
  }

  private initLogic(
    fieldLogic: FormFieldLogic<T, UserConfig, UserTypes>,
    subphase: LogicSubphase,
    config?: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    if (subphase === 'beforeConfig') {
      fieldLogic.onInit?.beforeConfig?.(this.formDirective.form, this.formDirective.formIndex);
    } else if (subphase === 'afterConfig') {
      if (!config) {
        throw new Error('No config!');
      }
      fieldLogic.onInit?.afterConfig?.(this.formDirective.form, config, this.formDirective.formIndex);
    }
  }

  private configChange(
    fieldLogic: FormFieldLogic<T, UserConfig, UserTypes>,
    subphase: LogicSubphase,
    config?: FormControlsConfigChange<T, UserConfig, UserTypes>
  ): void {
    if (subphase === 'beforeConfig') {
      fieldLogic.onConfigChange?.beforeConfig?.(this.formDirective.form, this.formDirective.formIndex);
    } else if (subphase === 'afterConfig') {
      if (!config) {
        throw new Error('No config!');
      }
      fieldLogic.onConfigChange?.afterConfig?.(this.formDirective.form, config, this.formDirective.formIndex);
    }
  }

  private valueChange(
    fieldLogic: FormFieldLogic<T, UserConfig, UserTypes>,
    subphase: LogicSubphase,
    config?: FormControlsConfigChange<T, UserConfig, UserTypes>
  ): void {
    if (subphase === 'beforeConfig') {
      fieldLogic.onValueChange?.beforeConfig?.(this.formDirective.form, this.formDirective.formIndex);
    } else if (subphase === 'afterConfig') {
      if (!config) {
        throw new Error('No config!');
      }
      fieldLogic.onValueChange?.afterConfig?.(this.formDirective.form, config, this.formDirective.formIndex);
    }
  }

  private recalculateLogic(
    fieldLogic: FormFieldLogic<T, UserConfig, UserTypes>,
    config?: FormControlsConfigChange<T, UserConfig, UserTypes>,
  ): void {
    if (!config) {
      throw new Error('No config!');
    }
    fieldLogic.onLogicRecalculate?.({form: this.formDirective.form, index: this.formDirective.formIndex, config, logic: fieldLogic});
  }

  private setConfigChange(value: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    this._formControlsConfigChange$.next(value);
  }

  private setLogic(value: FormControlsLogic<T, UserConfig, UserTypes>): void {
    this._formFieldLogic.next(value);
  }

  private setConfig(value: FormControlsConfig<T, UserConfig, UserTypes>): void {
    const config: any = value;
    const newConfig: any = {};
    Object.keys(config).forEach(key => {
      newConfig[key] = typeof config[key] === 'function' ? config[key] : { ...config[key] };
    });
    setConfig(this.formDirective.form, newConfig);
    this._controlsConfig$.next(newConfig);
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


export type FormControlsLogic<T, UserConfig, UserTypes> = RecursivePartialFormControlsLogic<FormRawValue<T>, UserConfig, UserTypes>;
type RecursivePartialFormControlsLogic<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldLogic<U, UserConfig, UserTypes> : ValueFormFieldLogic<T[P], UserConfig, UserTypes>;
};
type ValueFormFieldLogic<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldLogic<any, UserConfig, UserTypes> : RecursivePartialFormControlsLogic<T, UserConfig, UserTypes>;
export interface FormFieldLogic<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> {
  onInit?: {
    beforeConfig?: FormFieldLogicBeforeFn<T>;
    afterConfig?: FormFieldLogicAfterFn<T, UserConfig, UserTypes>;
  }
  onConfigChange?: {
    beforeConfig?: FormFieldLogicBeforeFn<T>;
    afterConfig?: FormFieldLogicAfterFn<T, UserConfig, UserTypes>;
  }
  onValueChange?: {
    beforeConfig?: FormFieldLogicBeforeFn<T>;
    afterConfig?: FormFieldLogicAfterFn<T, UserConfig, UserTypes>;
  }
  onLogicRecalculate?: FormFieldLogicRecalculateFn<T, UserConfig, UserTypes>;
}
export type FormFieldLogicBeforeFn<T extends { [K in keyof T]: AbstractControl }> = (form: FormGroup<T>, index?: number) => void;
export type FormFieldLogicRecalculateFn<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> = (data: {form: FormGroup<T>, config: FormControlsConfigChange<T, UserConfig, UserTypes>, logic: Omit<FormFieldLogic<T, UserConfig, UserTypes>, 'onLogicRecalculate'>, index?: number}) => void;
export type FormFieldLogicAfterFn<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> = (form: FormGroup<T>, config: FormControlsConfigChange<T, UserConfig, UserTypes>, index?: number) => void;
export type LogicPhase = 'init' | 'config' | 'value' | 'recalculate';
export type LogicSubphase = 'beforeConfig' | 'afterConfig' | 'none';
