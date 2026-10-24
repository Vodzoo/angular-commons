import { AbstractControl, FormArray, FormControl, FormGroup } from '@angular/forms';
import { computed, isSignal, Signal, signal, WritableSignal } from '@angular/core';
import { FormValue, FormValues, ValueChanges } from './directives/form.directive';
import { getRootBeforeUserChange$ } from './formModified';

type GroupValues = FormValues<any, any>;
type GroupValuesIndex = WeakMap<FormGroup, GroupValues>;
type InitialValuesIndex = WeakMap<FormGroup, unknown>;

// Indexes are tied to individual snapshot objects, not to array positions or paths.
const snapshotGroups = new WeakMap<object, GroupValuesIndex>();
const initialGroups = new WeakMap<AbstractControl, InitialValuesIndex>();

const rootFormValueChanges: unique symbol = Symbol('rootFormValueChanges');
const rootFormInitialValue: unique symbol = Symbol('rootFormInitialValue');

/** Capture the whole form while its structure still matches these values. */
export function captureFormValues<
  T extends { [K in keyof T]: AbstractControl },
  UserTypes
>(
  formGroup: FormGroup<T>,
  value: FormValue<T, UserTypes> = formGroup.value
): FormValues<T, UserTypes> {
  const values: FormValues<T, UserTypes> = {
    value,
    rawValue: formGroup.getRawValue() as FormValues<T, UserTypes>['rawValue']
  };

  // A disabled nested group has its own .value, even if its parent omits it.
  // Capture that value now; never reconstruct it from the root snapshot later.
  snapshotGroups.set(values, indexCurrentGroups(formGroup, values.rawValue, value));
  return values;
}

export function setRootFormValueChanges<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  // Both snapshots must already have their own identity indexes. Indexing an old
  // snapshot against the *current* tree would silently misattribute moved groups.
  ensureSignal<ValueChanges<T, UserTypes>>(formGroup.root, rootFormValueChanges).set(values);
}

export function setRootFormInitialValue<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(formGroup: FormGroup<T>, values: FormValue<T, UserTypes>): void {
  const root = formGroup.root;
  (root as any)[rootFormInitialValue] = values;
  // Initial data may differ from the live form (e.g. when restoring saved data).
  initialGroups.set(root, indexInitialGroups(root, values));
}

export function getRootFormValueChanges<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes,
  R extends { [K in keyof R]: AbstractControl<any, any> } = T
>(formGroup: FormGroup<T>): ValueChanges<R, UserTypes> | undefined {
  return ensureSignal<ValueChanges<R, UserTypes>>(formGroup.root, rootFormValueChanges)();
}

export function getRootFormValueChanges$<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes,
  R extends { [K in keyof R]: AbstractControl<any, any> } = T
>(formGroup: FormGroup<T>): Signal<ValueChanges<R, UserTypes> | undefined> {
  return ensureSignal<ValueChanges<R, UserTypes>>(formGroup.root, rootFormValueChanges).asReadonly();
}

export function getFormValueChanges<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(formGroup: FormGroup<T>): (ValueChanges<T, UserTypes> & {
  beforeUserChange?: FormValues<T, UserTypes>
}) | undefined {
  const root = formGroup.root;
  return projectFormValueChanges(
    formGroup,
    root,
    ensureSignal<ValueChanges<T, UserTypes>>(root, rootFormValueChanges)(),
    getRootBeforeUserChange$<T, UserTypes>(formGroup)()
  );
}

/** Project the last root-level change onto the same group in both snapshots. */
export function getFormValueChanges$<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(formGroup: FormGroup<T>): Signal<(ValueChanges<T, UserTypes> & {
  beforeUserChange?: FormValues<T, UserTypes>
}) | undefined> {
  const root = formGroup.root;
  const changes = ensureSignal<ValueChanges<T, UserTypes>>(root, rootFormValueChanges);
  const beforeUserChange = getRootBeforeUserChange$<T, UserTypes>(formGroup);
  return computed(() => projectFormValueChanges(formGroup, root, changes(), beforeUserChange()));
}

export function getRootFormInitialValue<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes,
  R extends { [K in keyof R]: AbstractControl<any, any> } = T
>(formGroup: FormGroup<T>): FormValue<R, UserTypes> {
  return (formGroup.root as any)[rootFormInitialValue];
}

export function getFormInitialValue<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(formGroup: FormGroup<T>): FormValue<T, UserTypes> {
  const root = formGroup.root;
  if (formGroup === root) {
    return (root as any)[rootFormInitialValue];
  }
  return (initialGroups.get(root)?.get(formGroup) ?? {}) as FormValue<T, UserTypes>;
}

function projectFormValueChanges<
  T extends { [K in keyof T]: AbstractControl<any, any> },
  UserTypes
>(
  formGroup: FormGroup<T>,
  root: AbstractControl,
  rootValueChanges: ValueChanges<T, UserTypes> | undefined,
  rootBeforeUserChange: ValueChanges<T, UserTypes> | undefined
): (ValueChanges<T, UserTypes> & {
  beforeUserChange?: FormValues<T, UserTypes>
}) | undefined {
  if (!rootValueChanges) {
    return undefined;
  }
  if (formGroup === root) {
    return {
      ...rootValueChanges,
      beforeUserChange: rootBeforeUserChange?.previous
    };
  }

  const current = snapshotGroups.get(rootValueChanges.current)?.get(formGroup);
  if (!current) {
    return undefined;
  }

  const previous = snapshotGroups.get(rootValueChanges.previous)?.get(formGroup);
  const baseline = rootBeforeUserChange
    ? snapshotGroups.get(rootBeforeUserChange.previous)?.get(formGroup)
    : undefined;

  return {
    ...rootValueChanges,
    beforeUserChange: baseline,
    // Deliberately preserve old fallback semantics for API compatibility.
    previous: previous ?? { rawValue: {}, value: {} },
    current
  } as ValueChanges<T, UserTypes> & {
    beforeUserChange?: FormValues<T, UserTypes>
  };
}

/** One signal per control/symbol, shared by getters and setters. */
function ensureSignal<T>(control: AbstractControl, key: symbol): WritableSignal<T | undefined> {
  const storage = control as unknown as Record<symbol, unknown>;
  const existing = storage[key];
  if (isSignal(existing)) {
    return existing as WritableSignal<T | undefined>;
  }
  const created = signal<T | undefined>(undefined);
  storage[key] = created;
  return created;
}

/**
 * Index a newly captured state. Use raw array indices, so disabled entries do
 * not shift identities. A nested FormGroup's own `.value` is authoritative.
 */
function indexCurrentGroups(
  root: FormGroup,
  rawValue: unknown,
  rootValue: unknown
): GroupValuesIndex {
  const groups: GroupValuesIndex = new WeakMap();

  function visit(control: AbstractControl, raw: any): void {
    if (raw === undefined || raw === null) {
      return;
    }
    if (control instanceof FormGroup) {
      groups.set(control, {
        rawValue: raw,
        value: (control === root ? rootValue : control.value) as GroupValues['value']
      });
      for (const key of Object.keys(control.controls)) {
        const child = control.controls[key];
        if (!(child instanceof FormControl)) {
          visit(child, raw[key]);
        }
      }
    } else if (control instanceof FormArray) {
      for (let index = 0; index < control.length; index++) {
        const child = control.at(index);
        if (!(child instanceof FormControl)) {
          visit(child, raw[index]);
        }
      }
    }
  }

  visit(root, rawValue);
  return groups;
}

/**
 * Index supplied initial values, which may not match the current controls'
 * values. Do not call `.value` here.
 */
function indexInitialGroups(root: AbstractControl, rawValue: unknown): InitialValuesIndex {
  const groups: InitialValuesIndex = new WeakMap();

  function visit(control: AbstractControl, raw: any): void {
    if (raw === undefined || raw === null) {
      return;
    }
    if (control instanceof FormGroup) {
      groups.set(control, raw);
      for (const key of Object.keys(control.controls)) {
        const child = control.controls[key];
        if (!(child instanceof FormControl)) {
          visit(child, raw[key]);
        }
      }
    } else if (control instanceof FormArray) {
      for (let index = 0; index < control.length; index++) {
        const child = control.at(index);
        if (!(child instanceof FormControl)) {
          visit(child, raw[index]);
        }
      }
    }
  }

  visit(root, rawValue);
  return groups;
}
