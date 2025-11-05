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
import {BehaviorSubject, debounceTime, distinctUntilChanged, Observable, startWith, tap} from "rxjs";
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
  private _initFired: boolean = false;
  private _configBeforeInit: boolean = true;
  private _logicBeforeInit: boolean = true;
  private readonly _defaultFormFieldsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this.formService.getFormFieldsConfig();
  private _defaultFormFieldsConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
  private readonly _defaultFormFieldLogic: FormControlsLogic<T, UserConfig, UserTypes> = this.formService.getFormFieldsLogic();
  private _formControlsConfig: FormControlsConfig<T, UserConfig, UserTypes> = this._defaultFormFieldsConfig;
  private readonly _formControlsConfigChange$: BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfigChange<T, UserConfig, UserTypes>>(this.mapConfigToChange(this._formControlsConfig));
  private readonly _formFieldLogic: BehaviorSubject<FormControlsLogic<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsLogic<T, UserConfig, UserTypes>>(this._defaultFormFieldLogic);
  private readonly _controlsConfig$: BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>> = new BehaviorSubject<FormControlsConfig<T, UserConfig, UserTypes>>(this._formControlsConfig);
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
    this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(value);
    const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);

    if (this._initFired) {
      this.runLogic(this._formFieldLogic.value, 'config', merged);
    }
    this.setConfigChange(merged);

    if (this._initFired) {
      this._configBeforeInit = false;
    }
  }

  /**
   * Inputs
   */
  @Input()
  public set formControlsLogic(value: FormControlsLogic<T, UserConfig, UserTypes> | undefined) {
    this.setLogic(!value || Object.keys(value).length === 0 ? this._defaultFormFieldLogic : mergeDeep(this._defaultFormFieldLogic, value, { ...this.mergeConfig, immutable: true }));
    if (this._initFired) {
      this.runLogic(this._formFieldLogic.value, 'recalculate', this._formControlsConfigChange$.value);
    }

    if (this._initFired) {
      this._logicBeforeInit = false;
    }
  }

  /**
   * Outputs
   */
  public configValue = output<FormControlsConfigChange<T, UserConfig, UserTypes>>();
  public config = output<FormControlsConfig<T, UserConfig, UserTypes>>();
  public logic = output<FormControlsLogic<T, UserConfig, UserTypes>>();



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
    this.setConfig(this._formControlsConfig);
    this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._formControlsConfig);
    const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
    this.runLogic(this._formFieldLogic.value, 'init', merged);
    if (this._configBeforeInit) {
      this.runLogic(this._formFieldLogic.value, 'config', merged);
    }
    if (this._logicBeforeInit) {
      this.runLogic(this._formFieldLogic.value, 'recalculate', merged);
    }
    this.setConfigChange(merged);

    if (!this.formConfigurationConfig.alwaysTrackConfigChange && Object.keys(this.controlsConfigChangeValue).length === 0) {
      return;
    }

    let status: FormControlStatus = this.formDirective.form$().status;
    this.formDirective.form$().root.valueChanges.pipe(
      debounceTime(0),
      distinctUntilChanged((prev, cur) => {
        const curStatus: FormControlStatus = this.formDirective.form$().status;
        const curStatusRoot: FormControlStatus = this.formDirective.form$().root.status;
        const statusChanged: boolean = curStatus !== status;
        const statusChangedRoot: boolean = curStatusRoot !== curStatus;
        if (statusChanged || statusChangedRoot) {
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
        this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
        const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
        const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._formControlsConfig);
        const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
        this.runLogic(this._formFieldLogic.value, 'value', merged);
        this.setConfigChange(merged);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    this.controlsConfigChange.pipe(
      startWith(this._formControlsConfigChange$.value),
      tap(value => this.configValue.emit(value)),
    ).subscribe();

    this.controlsConfig.pipe(
      startWith(this._controlsConfig$.value),
      tap(value => this.config.emit(value)),
    ).subscribe();

    this.controlsLogic.pipe(
      startWith(this._formFieldLogic.value),
      tap(value => this.logic.emit(value)),
    ).subscribe();

    this._initFired = true;
    this._configBeforeInit = false;
    this._logicBeforeInit = false;
  }

  public ngOnDestroy(): void {
    const methods = this.formService.recalculateMethods.filter(method => method !== this.recalculateConfig);
    this.formService.recalculateMethods.length = 0;
    this.formService.recalculateMethods.push(...methods);

    this._defaultFormFieldsConfigChange = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const targetChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._defaultFormFieldsConfig);
    const sourceChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.mapConfigToChange(this._formControlsConfig);
    const merged: FormControlsConfigChange<T, UserConfig, UserTypes> = mergeDeep(targetChange, sourceChange, this.mergeConfig);
    this.runLogic(this._formFieldLogic.value, 'destroy', merged);
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
        (change as any)[key] = ((mergedConfig as any)[key] as FormFieldConfigFn<T, any, any>)(this.formDirective.form$(), this._defaultFormFieldsConfigChange, this.formDirective.formIndex$());
      }
    })
    return change;
  }

  private runLogic(logic: FormControlsLogic<T, UserConfig, UserTypes>, phase: LogicPhase, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    Object.keys(logic).forEach((key: string) => {
      const fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes> = (logic as any)[key];
      if (typeof fieldLogic !== 'function') {
        return;
      }
      switch (phase) {
        case 'init':
          this.initLogic(fieldLogic, config)
          break;
        case 'destroy':
          this.destroyLogic(fieldLogic, config)
          break;
        case 'config':
          this.configChange(fieldLogic, config);
          break;
        case 'value':
          this.valueChange(fieldLogic, config);
          break;
        case 'recalculate':
          this.recalculateLogic(fieldLogic, config);
          break;
        default:
          break;
      }
    })
  }

  private initLogic(fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes>, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    fieldLogic({
      onInit: (argsFn) => {
        argsFn?.({
          form: this.formDirective.form$(),
          config,
          index: this.formDirective.formIndex$(),
        });
      }
    });
  }

  private destroyLogic(fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes>, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    fieldLogic({
      onDestroy: (argsFn) => {
        argsFn?.({
          form: this.formDirective.form$(),
          config,
          index: this.formDirective.formIndex$(),
        });
      }
    });
  }

  private configChangeState: FormFieldLogicFnState | undefined | void;
  private configChange(fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes>, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    if (this.configChangeState?.stopExecution) {
      return;
    }
    fieldLogic({
      onConfigChange: (argsFn) => {
        this.configChangeState = argsFn?.({
          form: this.formDirective.form$(),
          config,
          index: this.formDirective.formIndex$(),
        });
      }
    });
  }

  private valueChangeState: FormFieldLogicFnState | undefined | void;
  private valueChange(fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes>, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    if (this.valueChangeState?.stopExecution) {
      return;
    }
    fieldLogic({
      onValueChange: (argsFn) => {
        this.valueChangeState = argsFn?.({
          form: this.formDirective.form$(),
          config,
          index: this.formDirective.formIndex$(),
        });
      }
    });
  }

  private recalculationState: FormFieldLogicFnState | undefined | void;
  private recalculateLogic(fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes>, config: FormControlsConfigChange<T, UserConfig, UserTypes>): void {
    if (this.recalculationState?.stopExecution) {
      return;
    }
    fieldLogic({
      onLogicRecalculate: (argsFn) => {
        this.recalculationState = argsFn?.({
          form: this.formDirective.form$(),
          config,
          index: this.formDirective.formIndex$()
        })
      }
    });
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
    setConfig(this.formDirective.form$(), newConfig);
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
type ValueFormFieldLogic<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldLogicFn<any, UserConfig, UserTypes> : RecursivePartialFormControlsLogic<T, UserConfig, UserTypes>;
export type FormFieldLogicFn<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> = (spec: FormFieldLogicFnSpec<T, UserConfig, UserTypes>) => void;
export interface FormFieldLogicFnSpec<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> {
  onInit?: (argsFn: FormFieldLogicFnSpecArgsFn<T, UserConfig, UserTypes>) => any,
  onDestroy?: (argsFn: FormFieldLogicFnSpecArgsFn<T, UserConfig, UserTypes>) => any,
  onConfigChange?: (argsFn: FormFieldLogicFnSpecArgsFn<T, UserConfig, UserTypes>) => any,
  onValueChange?: (argsFn: FormFieldLogicFnSpecArgsFn<T, UserConfig, UserTypes>) => any,
  onLogicRecalculate?: (argsFn: FormFieldLogicFnSpecArgsFn<T, UserConfig, UserTypes>) => any,
}
export type FormFieldLogicFnSpecArgsFn<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> = (args: {form: FormGroup<T>, config: FormControlsConfigChange<T, UserConfig, UserTypes>, index?: number}) => FormFieldLogicFnState | undefined | void;
export interface FormFieldLogicFnState {
  stopExecution: boolean;
}
export type LogicPhase = 'init' | 'config' | 'value' | 'recalculate' | 'destroy';
