import {
  computed,
  DestroyRef,
  Directive,
  effect,
  inject,
  InjectionToken,
  Injector,
  input,
  OnInit,
  runInInjectionContext,
  Signal,
  signal,
} from '@angular/core';
import {AbstractControl, FormControlStatus, FormGroup} from "@angular/forms";
import {FormDirective, FormRawValue, FormValue} from "./form.directive";
import {FormService} from "../services/form.service";
import {distinctUntilChanged} from "rxjs";
import {takeUntilDestroyed, toSignal} from "@angular/core/rxjs-interop";
import {setConfig} from "../formConfig";
import {MERGE_CONFIG, MergeConfig, mergeDeep} from "../mergeDeep";


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
export class FormConfigDirective<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> implements OnInit {
  /**
   * ------------------------------------
   * Injected services
   * ------------------------------------
   * @private
   */
  private formService: FormService<T, UserConfig, UserTypes> = inject(FormService<T, UserConfig, UserTypes>);
  private formDirective: FormDirective<T, UserConfig, UserTypes> = inject(FormDirective<T, UserConfig, UserTypes>);
  private formConfigurationConfig: FormConfigurationConfig = inject(FORM_CONFIGURATION_CONFIG);
  private mergeConfig: MergeConfig = inject(MERGE_CONFIG);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);


  /**
   * ------------------------------------
   * Fields
   * ------------------------------------
   */
  private formStatus: FormControlStatus = this.formDirective.form.status;
  private prevousConfigChange?: FormControlsConfigChange<T, UserConfig, UserTypes>;


  /**
   * Signals
   */
  private formValueChanges: Signal<FormValue<T, UserTypes> | undefined> = signal(undefined).asReadonly();

  //config
  private _defaultFormControlsConfig = computed((): FormControlsConfig<T, UserConfig, UserTypes> => {
    return this.formService.getFormFieldsConfig();
  });
  private _formControlsConfig = computed((): FormControlsConfig<T, UserConfig, UserTypes> => {
    const inputValue: FormControlsConfig<T, UserConfig, UserTypes> | undefined = this.formControlsConfigInput();
    return !inputValue || Object.keys(inputValue).length === 0 ? this._defaultFormControlsConfig() : inputValue;
  });

  //config change
  private _defaultFormControlsConfigChange = computed((): FormControlsConfigChange<T, UserConfig, UserTypes> => {
    this.formValueChanges();
    return this.mapConfigToChange(this._defaultFormControlsConfig(), this.formDirective.form, {}, this.formDirective.formIndex);
  });
  private _formControlsConfigChange = computed((): FormControlsConfigChange<T, UserConfig, UserTypes> => {
    this.formValueChanges();
    return this.mapConfigToChange(this._formControlsConfig(), this.formDirective.form, this._defaultFormControlsConfigChange(), this.formDirective.formIndex);
  });

  //logic
  private _defaultFormControlsLogic = computed((): FormControlsLogic<T, UserConfig, UserTypes> => {
    return this.formService.getFormFieldsLogic();
  });
  private _formControlsLogic = computed((): FormControlsLogic<T, UserConfig, UserTypes> => {
    const inputValue: FormControlsLogic<T, UserConfig, UserTypes> | undefined = this.formControlsLogicInput();
    return !inputValue || Object.keys(inputValue).length === 0 ? this._defaultFormControlsLogic() : inputValue;
  });

  //public signals
  public controlsConfig = computed((): FormControlsConfig<T, UserConfig, UserTypes> => {
    this.formValueChanges();
    return mergeDeep({}, this._formControlsConfig(), {...this.mergeConfig, immutable: true});
  });
  public controlsConfigChange = computed((): FormControlsConfigChange<T, UserConfig, UserTypes> => {
    return this._formControlsConfigChange();
  });
  public controlsLogic = computed((): FormControlsLogic<T, UserConfig, UserTypes> => {
    this.formValueChanges();
    return mergeDeep({}, this._formControlsLogic(), {...this.mergeConfig, immutable: true});
  })


  /**
   * ------------------------------------
   * Inputs
   * ------------------------------------
   */
  public formControlsConfigInput = input<FormControlsConfig<T, UserConfig, UserTypes> | undefined>(this._defaultFormControlsConfig(), {alias: 'formControlsConfig'});
  public formControlsLogicInput = input<FormControlsLogic<T, UserConfig, UserTypes> | undefined>(this._defaultFormControlsLogic(), {alias: 'formControlsLogic'});


  /**
   * Hooks
   */
  public ngOnInit() {
    runInInjectionContext(this.injector, () => {
      this.formValueChanges = toSignal(this.formDirective.form.valueChanges.pipe(
        distinctUntilChanged((prev, cur) => {
          const curStatus: FormControlStatus = this.formDirective.form.status;
          const statusChanged: boolean = curStatus !== this.formStatus;
          if (statusChanged) {
            this.formStatus = curStatus;
            return false;
          }
          return this.formConfigurationConfig.equalFn(prev, cur);
        }),
        takeUntilDestroyed(this.destroyRef)
      ));
    });
  }


  /**
   * Effects
   */
  private setConfigEffect = effect(() => {
    setConfig(this.formDirective.form, this.controlsConfig());
  });

  private initialLogicRun: boolean = true;
  private runLogicEffect = effect(() => {
    const logic: FormControlsLogic<T, UserConfig, UserTypes> = this.controlsLogic();
    const currentConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this.controlsConfigChange();
    const defaultConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes> = this._defaultFormControlsConfigChange();
    this.runLogic(logic, {
      default: defaultConfigChange,
      current: currentConfigChange,
      previous: this.prevousConfigChange ?? {}
    });
    this.initialLogicRun = false;
    this.prevousConfigChange = currentConfigChange;
  });


  /**
   * ------------------------------------
   * Other methods
   * ------------------------------------
   */
  private mapConfigToChange(
    config: FormControlsConfig<T, UserConfig, UserTypes>,
    form: FormGroup<T>,
    defaultConfigChange: FormControlsConfigChange<T, UserConfig, UserTypes>,
    formIndex?: number
  ): FormControlsConfigChange<T, UserConfig, UserTypes> {
    const change: FormControlsConfigChange<T, UserConfig, UserTypes> = {};
    Object.keys(config).forEach((key: string) => {
      if ((typeof (config as any)[key]) === 'function') {
        (change as any)[key] = ((config as any)[key] as FormFieldConfigFn<T, any, any>)(form, defaultConfigChange, formIndex);
      }
    })
    return change;
  }

  private runLogic(logic: FormControlsLogic<T, UserConfig, UserTypes>, config: FormFieldLogicFnConfig<T, UserConfig, UserTypes>): void {
    Object.keys(logic).forEach((key: string) => {
      const fieldLogic: FormFieldLogicFn<T, UserConfig, UserTypes> | object = (logic as any)[key];
      if (typeof fieldLogic === 'function') {
        fieldLogic(
          {
            form: this.formDirective.form,
            config,
            index: this.formDirective.formIndex,
            initialLogicRun: this.initialLogicRun
          }
        );
      }
    })
  }
}


/**
 * ------------------------------------
 * Types
 * ------------------------------------
 */
export type FormControlsConfig<T, UserConfig, UserTypes> = RecursivePartialFormControlsConfig<FormRawValue<T>, UserConfig, UserTypes>;
type AllowedTypes<UserTypes> = boolean | string | number | undefined | null | UserTypes;
type RecursivePartialFormControlsConfig<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigArray<U, UserConfig, UserTypes> : ValueFormFieldConfig<T[P], UserConfig, UserTypes>;
};

type ValueFormFieldConfig<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, UserConfig, UserTypes> : RecursivePartialFormControlsConfig<T, UserConfig, UserTypes>;
type ValueFormFieldConfigArray<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldConfigFn<any, UserConfig, UserTypes> : RecursivePartialFormControlsConfig<T, UserConfig, UserTypes>;
export type FormFieldConfigFn<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserConfig, UserTypes> = (control: FormGroup<T>, defaultConfig: FormControlsConfigChange<T, UserConfig, UserTypes>, index?: number) => UserConfig;


export type FormControlsConfigChange<T, UserConfig, UserTypes> = RecursivePartialFormControlsConfigChange<FormRawValue<T>, UserConfig, UserTypes>;
type RecursivePartialFormControlsConfigChange<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldConfigChange<U, UserConfig, UserTypes> : ValueFormFieldConfigChange<T[P], UserConfig, UserTypes>;
};
type ValueFormFieldConfigChange<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? UserConfig : RecursivePartialFormControlsConfigChange<T, UserConfig, UserTypes>;


export type FormControlsLogic<T, UserConfig, UserTypes> = RecursivePartialFormControlsLogic<FormRawValue<T>, UserConfig, UserTypes>;
type RecursivePartialFormControlsLogic<T, UserConfig, UserTypes> = {
  [P in keyof T]?:
  T[P] extends Array<infer U> ? ValueFormFieldLogic<U, UserConfig, UserTypes> : ValueFormFieldLogic<T[P], UserConfig, UserTypes>;
};
type ValueFormFieldLogic<T, UserConfig, UserTypes> = T extends AllowedTypes<UserTypes> ? FormFieldLogicFn<any, UserConfig, UserTypes> : RecursivePartialFormControlsLogic<T, UserConfig, UserTypes>;
export type FormFieldLogicFn<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> = (
  opts: {
    form: FormGroup<T>;
    config: FormFieldLogicFnConfig<T, UserConfig, UserTypes>;
    index?: number;
    initialLogicRun: boolean;
  }
) => void;
export interface FormFieldLogicFnConfig<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> {
  default: FormControlsConfigChange<T, UserConfig, UserTypes>;
  current: FormControlsConfigChange<T, UserConfig, UserTypes>;
  previous: FormControlsConfigChange<T, UserConfig, UserTypes>;
}
