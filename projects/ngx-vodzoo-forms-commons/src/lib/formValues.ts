import { AbstractControl, FormArray, FormControl, FormGroup } from "@angular/forms";
import { FormValue, FormValues, ValueChanges} from "./directives/form.directive";
import { computed, isSignal, Signal, signal, WritableSignal } from "@angular/core";
import { getRootBeforeUserChange$ } from "./formModified";

type GroupValues = FormValues<any, any>;
type GroupValuesIndex = WeakMap<FormGroup, GroupValues>;

// Keep identity metadata outside public snapshots and release it with each snapshot.
const snapshotGroups = new WeakMap<object, GroupValuesIndex>();
const initialGroups = new WeakMap<AbstractControl, GroupValuesIndex>();

/** Capture once at the root, before pairwise loses the previous tree structure. */
export function captureFormValues<T extends { [K in keyof T]: AbstractControl }, UserTypes>(
  formGroup: FormGroup<T>,
  value: FormValue<T, UserTypes> = formGroup.value
): FormValues<T, UserTypes> {
  const values: FormValues<T, UserTypes> = {
    value,
    rawValue: formGroup.getRawValue() as FormValues<T, UserTypes>['rawValue']
  };
  snapshotGroups.set(values, indexGroups(formGroup, values.rawValue, values.value));
  return values;
}

export function setRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: ValueChanges<T, UserTypes>): void {
  // Fallback for snapshots matching the current tree and disabled state.
  // Capture historical snapshots with captureFormValues before either changes.
  const root = formGroup.root;
  rememberSnapshot(root, values.previous);
  rememberSnapshot(root, values.current);
  ensureSignal(root, rootFormValueChanges).set(values);
}

export function setRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>, values: FormValue<T, UserTypes>): void {
  const root = formGroup.root;
  (root as any)[rootFormInitialValue] = values;
  initialGroups.set(root, indexGroups(root, values, undefined));
}

export function getRootFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): ValueChanges<R, UserTypes> | undefined {
  return ensureSignal(formGroup.root, rootFormValueChanges)();
}

export function getRootFormValueChanges$<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): Signal<ValueChanges<R, UserTypes> | undefined> {
  return ensureSignal(formGroup.root, rootFormValueChanges).asReadonly();
}

export function getFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes>(formGroup: FormGroup<T>): (ValueChanges<T, UserTypes> & {beforeUserChange?: FormValues<T, UserTypes>}) | undefined {
  const root = formGroup.root;
  return projectFormValueChanges(
    formGroup,
    root,
    ensureSignal<ValueChanges<T, UserTypes> | undefined>(root, rootFormValueChanges)(),
    getRootBeforeUserChange$<T, UserTypes>(formGroup)()
  );
}

/** Project the last published data change onto the same group in each snapshot. */
export function getFormValueChanges$<T extends { [K in keyof T]: AbstractControl<any, any>; },  UserTypes>(formGroup: FormGroup<T>): Signal<(ValueChanges<T, UserTypes> & {beforeUserChange?: FormValues<T, UserTypes>}) | undefined> {
  const root = formGroup.root;
  const changes = ensureSignal<ValueChanges<T, UserTypes> | undefined>(root, rootFormValueChanges);
  const beforeUserChange = getRootBeforeUserChange$<T, UserTypes>(formGroup);
  return computed(() => projectFormValueChanges(formGroup, root, changes(), beforeUserChange()));
}

export function getRootFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes, R extends { [K in keyof R]: AbstractControl<any, any>; } = T>(formGroup: FormGroup<T>): FormValue<R, UserTypes> {
  return (formGroup.root as any)[rootFormInitialValue];
}

export function getFormInitialValue<T extends { [K in keyof T]: AbstractControl<any, any>; }, UserTypes>(formGroup: FormGroup<T>): FormValue<T, UserTypes> {
  const root = formGroup.root;
  if (formGroup === root) {
    return (root as any)[rootFormInitialValue];
  }
  return initialGroups.get(root)?.get(formGroup)?.rawValue ?? {};
}


/**
 * helpers
 */

function projectFormValueChanges<T extends { [K in keyof T]: AbstractControl<any, any> }, UserTypes>(
  formGroup: FormGroup<T>,
  root: AbstractControl,
  rootValueChanges: ValueChanges<T, UserTypes> | undefined,
  rootBeforeUserChange: ValueChanges<T, UserTypes> | undefined
): (ValueChanges<T, UserTypes> & {beforeUserChange?: FormValues<T, UserTypes>}) | undefined {
  if (!rootValueChanges) {
    return undefined;
  }
  if (formGroup === root) {
    return {
      ...rootValueChanges,
      beforeUserChange: rootBeforeUserChange?.previous,
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
    previous: previous ?? {rawValue: {}, value: {}},
    current,
  } as ValueChanges<T, UserTypes> & {beforeUserChange?: FormValues<T, UserTypes>};
}

function ensureSignal<W extends T[R], T extends object = any, R extends keyof T = any>(obj: T, key: R | symbol): WritableSignal<W> {
  if (obj && key && !isSignal(obj[key as unknown as R])) {
    obj[key as unknown as R] = signal(obj[key as unknown as R]) as W;
  }
  return obj[key as unknown as R] as WritableSignal<W>;
}

function rememberSnapshot(control: AbstractControl, values: GroupValues): void {
  if (!snapshotGroups.has(values)) {
    snapshotGroups.set(values, indexGroups(control, values.rawValue, values.value));
  }
}

function indexGroups(control: AbstractControl, rawValue: any, value: any): GroupValuesIndex {
  const groups: GroupValuesIndex = new WeakMap();
  visitGroups(control, rawValue, value, groups);
  return groups;
}

function visitGroups(current: AbstractControl, raw: any, enabled: any, groups: GroupValuesIndex): void {
  if (raw === undefined || raw === null) {
    return;
  }
  if (current instanceof FormGroup) {
    groups.set(current, {rawValue: raw, value: enabled ?? {}});
    for (const key of Object.keys(current.controls)) {
      const child = current.controls[key];
      if (!(child instanceof FormControl)) {
        visitGroups(child, raw[key], enabled?.[key], groups);
      }
    }
  } else if (current instanceof FormArray) {
    let enabledIndex = 0;
    for (let index = 0; index < current.length; index++) {
      const child = current.at(index);
      const included = current.disabled || child.enabled;
      const childValue = included ? enabled?.[enabledIndex++] : undefined;
      if (!(child instanceof FormControl)) {
        visitGroups(child, raw[index], childValue, groups);
      }
    }
  }
}

export function getNestedValue(obj: any, path: string[], fallbackToEmptyObject: boolean = true): any {
  return path.reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj) ?? (fallbackToEmptyObject ? {} : undefined);
}



/**
 * Symbols
 */
const rootFormValueChanges: unique symbol = Symbol('rootFormValueChanges');
const rootFormInitialValue: unique symbol = Symbol('rootFormInitialValue');
