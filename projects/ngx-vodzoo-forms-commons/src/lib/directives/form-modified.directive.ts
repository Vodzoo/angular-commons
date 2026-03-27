import {computed, Directive, effect, EffectRef, inject, InjectionToken, input, output, Signal} from '@angular/core';
import {FORM_SERVICE_CONFIG, FormServiceConfig, STORAGE} from "../services/form.service";
import {FormDirective, FormRawValue, ValueChanges} from "./form.directive";
import {AbstractControl} from "@angular/forms";
import {getFormValueChanges$} from "../formValues";
import {methodSignal} from "../signals/method-signal";
import {filter, map, of} from "rxjs";
import {setFormModified} from "../formModified";

export interface FormModifiedConfig {
  equalFn: FormModifiedEqualFn;
  valueSelectorFn?: ValueSelectorFn;
}

export type FormModifiedEqualFn = (a: any, b: any, path: (string | number)[]) => boolean;
export type ValueSelectorFn = (value: any, path: (string | number)[]) => any;

export interface FormValueModified {
  modified: boolean;
  diffs: FormModifiedDiffEntry[];
}


export interface FormModifiedDiffEntry {
  path: (string | number)[];
  pathString: string;
  previousValue: any;
  currentValue: any;
}

export interface GetDiffParams {
  previous: any;
  current: any;
  equalFn: FormModifiedEqualFn;
  valueSelectorFn?: ValueSelectorFn;
  path?: (string | number)[];
}

export const DEFAULT_FORM_MODIFIED_CONFIG: FormModifiedConfig = {
  equalFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
} as const;

export const FORM_MODIFIED_CONFIG: InjectionToken<FormModifiedConfig> = new InjectionToken<FormModifiedConfig>('FORM_MODIFIED_CONFIG', {
  factory: () => DEFAULT_FORM_MODIFIED_CONFIG
});

@Directive({
  selector: '[vFormModified]',
  exportAs: 'vFormModified',
  standalone: true
})
export class FormModifiedDirective<T extends { [K in keyof T]: AbstractControl }, UserConfig, UserTypes> {
  /**
   * Provider tokens
   */
  private readonly formDirective: FormDirective<T, UserConfig, UserTypes> = inject(FormDirective<T, UserConfig, UserTypes>);
  private readonly storage: Storage = inject(STORAGE);
  private readonly formServiceConfig: FormServiceConfig = inject(FORM_SERVICE_CONFIG);
  private readonly formModifiedConfig: FormModifiedConfig = inject(FORM_MODIFIED_CONFIG);

  /**
   * Computed
   */
  private readonly storageKey = computed(() => `${this.formDirective.componentId$()}_beforeUserChange`);
  private readonly storageData = computed(() => this.storage.getItem(this.storageKey()));
  private readonly equalFn = computed(() => this.formModifiedEqualFn() ?? this.formModifiedConfig.equalFn);
  private readonly valueSelectorFn = computed(() => this.formModifiedValueSelectorFn() ?? this.formModifiedConfig.valueSelectorFn);
  private readonly valueChanges = computed(() => getFormValueChanges$(this.formDirective.form$())());
  private readonly storageValue = computed(() => {
    const data: string | null = this.storageData();
    return data ? this.formServiceConfig.parserFn(data) as FormRawValue<T> : undefined
  });

  /**
   * Inputs
   */
  public readonly formModifiedEqualFn = input<FormModifiedEqualFn | undefined>(undefined);
  public readonly formModifiedValueSelectorFn = input<ValueSelectorFn | undefined>(undefined);

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

  private readonly formDiffs: Signal<FormModifiedDiffEntry[] | undefined> = methodSignal({
    params: computed(() => {
      const valueChanges = this.valueChanges();
      const valueBeforeChange = this.valueBeforeChange();
      const equalFn = this.equalFn();
      const valueSelectorFn = this.valueSelectorFn();
      if (!valueChanges || !valueBeforeChange) {
        return undefined;
      }
      return {
        current: valueChanges.current.rawValue,
        previous: valueBeforeChange,
        equalFn,
        valueSelectorFn,
      }
    }),
    computation: ({ methodParams }) => {
      const { current, previous, equalFn } = methodParams;
      return getDiff(
        {
          previous,
          current,
          equalFn,
          valueSelectorFn: methodParams.valueSelectorFn,
        }
      );
    }
  });

  private readonly emitModification: Signal<void | undefined> = methodSignal({
    params: this.formDiffs,
    computation: ({ methodParams: diffs }) => {
      const modifications: FormValueModified = {
        modified: !!diffs.length,
        diffs
      };
      this.formValueModified.emit(modifications);
      setFormModified(this.formDirective.form$(), modifications);
    }
  });

  /**
   * Effects
   */
  private readonly setInitialState: EffectRef = effect(() => {
    const state: FormRawValue<T> | undefined = this.valueBeforeChange();
    if (!state) {
      return;
    }
    this.storage.setItem(this.storageKey(), JSON.stringify(state));
    // storage is cleared on destroy in form.service
  });
}

export function getDiff({
                          previous,
                          current,
                          equalFn,
                          valueSelectorFn,
                          path = []
                        }: GetDiffParams): FormModifiedDiffEntry[] {

  const changes: FormModifiedDiffEntry[] = [];

  const left = valueSelectorFn ? valueSelectorFn(previous, path) : previous;
  const right = valueSelectorFn ? valueSelectorFn(current, path) : current;

  const isObject = (v: any) => v !== null && typeof v === 'object';

  const bothObjects = isObject(left) && isObject(right);

  if (!bothObjects) {
    if (!equalFn(left, right, path)) {
      changes.push({
        path,
        pathString: path.join('.'),
        previousValue: previous,
        currentValue: current
      });
    }
    return changes;
  }

  if (equalFn(left, right, path)) {
    return [];
  }

  const keys = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(current ?? {})
  ]);

  for (const key of keys) {
    const nextPath = Array.isArray(current)
      ? [...path, Number(key)]
      : [...path, key];

    changes.push(
      ...getDiff({
        previous: previous?.[key],
        current: current?.[key],
        equalFn,
        valueSelectorFn,
        path: nextPath
      })
    );
  }

  return changes;
}
