import {computed, Directive, effect, EffectRef, inject, InjectionToken, input, output, Signal} from '@angular/core';
import {FORM_SERVICE_CONFIG, FormService, FormServiceConfig, STORAGE} from "../services/form.service";
import {FormDirective, FormRawValue, ValueChanges} from "./form.directive";
import {AbstractControl} from "@angular/forms";
import {getFormValueChanges$} from "../formValues";
import {methodSignal} from "../signals/method-signal";
import {filter, map, of} from "rxjs";


export const DEFAULT_FORM_MODIFIED_CONFIG: FormModifiedConfig = {
  equalFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
} as const;

export const FORM_MODIFIED_CONFIG: InjectionToken<FormModifiedConfig> = new InjectionToken<FormModifiedConfig>('FORM_MODIFIED_CONFIG', {
  factory: () => DEFAULT_FORM_MODIFIED_CONFIG
});

export interface FormModifiedConfig {
  equalFn: FormModifiedEqualFn;
}

export type FormModifiedEqualFn = (a: any, b: any, service: FormService<any, any, any>) => boolean;

@Directive({
  selector: '[vFormModified]',
  exportAs: 'vFormModified',
  standalone: true
})
export class FormModifiedDirective<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> {
  /**
   * Provider tokens
   */
  private readonly formService: FormService<T, UserConfig, UserTypes> = inject(FormService<T, UserConfig, UserTypes>);
  private readonly formDirective: FormDirective<T, UserConfig, UserTypes> = inject(FormDirective<T, UserConfig, UserTypes>);
  private readonly storage: Storage = inject(STORAGE);
  private readonly formServiceConfig: FormServiceConfig = inject(FORM_SERVICE_CONFIG);
  private readonly formModifiedConfig: FormModifiedConfig = inject(FORM_MODIFIED_CONFIG);

  /**
   * Fields
   */
  private readonly storageKey = `${this.formDirective.componentId}_beforeUserChange`;
  private readonly storageData = this.storage.getItem(this.storageKey);

  /**
   * Computed
   */
  private readonly equalFn = computed(() => this.formModifiedEqualFn() ?? this.formModifiedConfig.equalFn);
  private readonly valueChanges = computed(() => getFormValueChanges$(this.formDirective.form$())());
  private readonly storageValue = computed(() => this.storageData ? this.formServiceConfig.parserFn(this.storageData) as FormRawValue<T> : undefined);

  /**
   * Inputs
   */
  public readonly formModifiedEqualFn = input<FormModifiedEqualFn | undefined>(undefined);

  /**
   * Outputs
   */
  public readonly formValueModified = output<FormValueModified>();

  /**
   * Method signal
   */
  private readonly valueBeforeChange: Signal<FormRawValue<T> | undefined> = methodSignal({
    params: computed(() => {
      return {
        valueChanges: this.valueChanges(),
        storageValue: this.storageValue(),
      }
    }),
    computation: ({ methodParams }) => {
      const storageValue: FormRawValue<T> | undefined = methodParams.storageValue;
      const valueChanges: ValueChanges<T, unknown> | undefined = methodParams.valueChanges;
      if (storageValue) {
        return storageValue;
      }
      if (!valueChanges) {
        return undefined;
      }
      return of(valueChanges)
        .pipe(
          filter(value => value.firstUiChange),
          map(value => value.previous.rawValue),
        )
    }
  });

  private readonly isModified: Signal<boolean | undefined> = methodSignal({
    params: computed(() => {
      const valueChanges = this.valueChanges();
      const valueBeforeChange = this.valueBeforeChange();
      if (!valueChanges || !valueBeforeChange) {
        return undefined;
      }
      return {
        valueChanges,
        valueBeforeChange,
      }
    }),
    computation: ({ methodParams }) => !this.equalFn()(methodParams.valueChanges.current.rawValue, methodParams.valueBeforeChange, this.formService)
  });

  private readonly emitModification: Signal<void | undefined> = methodSignal({
    params: this.isModified,
    computation: ({ methodParams: modified }) => this.formValueModified.emit({modified})
  });

  /**
   * Effects
   */
  private readonly setInitialState: EffectRef = effect(() => {
    const state: FormRawValue<T> | undefined = this.valueBeforeChange();
    if (!state) {
      return;
    }
    this.storage.setItem(this.storageKey, JSON.stringify(state));
    // storage is cleared on destroy in form.service
  });
}


export interface FormValueModified {
  modified: boolean;
}
