import {AbstractControl, FormArray, FormControl, FormGroup} from '@angular/forms';
import {computed, signal, untracked} from '@angular/core';
import {FormValue, FormValues, ValueChanges} from './directives/form.directive';
import {setRootBeforeUserChange} from './formModified';
import {
  getFormInitialValue,
  getFormValueChanges,
  getFormValueChanges$,
  getRootFormInitialValue,
  getRootFormValueChanges,
  getRootFormValueChanges$,
  setRootFormInitialValue,
  setRootFormValueChanges
} from './formValues';
import {disableControl, enableControl} from './disableWithContext';

type DetailsControls = {city: FormControl<string>};
type TestControls = {
  name: FormControl<string>;
  details: FormGroup<DetailsControls>;
};

describe('form value changes', () => {
  let form: FormGroup<TestControls>;
  let details: FormGroup<DetailsControls>;

  beforeEach(() => {
    details = new FormGroup({city: new FormControl('Initial city', {nonNullable: true})});
    form = new FormGroup({
      name: new FormControl('Initial name', {nonNullable: true}),
      details,
    });
  });

  it('returns undefined for root and nested groups before any recorded change', () => {
    expect(getFormValueChanges(form)).toBeUndefined();
    expect(getFormValueChanges(details)).toBeUndefined();
    expect(getFormValueChanges$(form)()).toBeUndefined();
    expect(getFormValueChanges$(details)()).toBeUndefined();
  });

  it('tracks later root changes when synchronous getters are read inside computed', () => {
    const rootChanges = computed(() => getFormValueChanges(form));
    const nestedChanges = computed(() => getFormValueChanges(details));
    expect(rootChanges()).toBeUndefined();
    expect(nestedChanges()).toBeUndefined();

    const initial = snapshot(form);
    details.controls.city.setValue('First edit');
    const firstEvent = changes<TestControls>(initial, snapshot(form));
    setRootFormValueChanges(form, firstEvent);

    expect(rootChanges()!.current).toBe(firstEvent.current);
    expect(nestedChanges()!.current).toEqual({
      rawValue: {city: 'First edit'}, value: {city: 'First edit'}
    });

    details.controls.city.setValue('Second edit');
    const secondEvent = changes<TestControls>(firstEvent.current, snapshot(form));
    setRootFormValueChanges(form, secondEvent);

    expect(rootChanges()!.current).toBe(secondEvent.current);
    expect(nestedChanges()!.previous.rawValue).toEqual({city: 'First edit'});
    expect(nestedChanges()!.current.rawValue).toEqual({city: 'Second edit'});
  });

  it('updates synchronous getter projections when only the first UI baseline changes', () => {
    const initial = snapshot(form);
    details.controls.city.setValue('Edited city');
    const event = changes<TestControls>(initial, snapshot(form), true, true);
    setRootFormValueChanges(form, event);
    const rootChanges = computed(() => getFormValueChanges(form));
    const nestedChanges = computed(() => getFormValueChanges(details));
    const rootBefore = rootChanges()!;
    const nestedBefore = nestedChanges()!;
    expect(rootBefore.beforeUserChange).toBeUndefined();
    expect(nestedBefore.beforeUserChange).toBeUndefined();

    setRootBeforeUserChange(form, event);

    expect(getRootFormValueChanges(form)).toBe(event);
    expect(rootChanges()!.beforeUserChange).toBe(initial);
    expect(rootChanges()!.current).toBe(rootBefore.current);
    expect(nestedChanges()!.beforeUserChange).toEqual({
      rawValue: {city: 'Initial city'}, value: {city: 'Initial city'}
    });
    expect(nestedChanges()!.current).toBe(nestedBefore.current);
    expect(nestedChanges()!.previous).toBe(nestedBefore.previous);
  });

  it('respects untracked reads while allowing a later explicit refresh to read current data', () => {
    const initial = snapshot(form);
    setRootFormValueChanges(form, changes<TestControls>(initial, initial));
    const refresh = signal(0);
    const observed = computed(() => {
      refresh();
      return untracked(() => getFormValueChanges(details));
    });
    const firstRead = observed()!;

    details.controls.city.setValue('Edited city');
    setRootFormValueChanges(form, changes<TestControls>(initial, snapshot(form)));

    expect(observed()).toBe(firstRead);
    expect(firstRead.current.rawValue).toEqual({city: 'Initial city'});
    expect(untracked(() => getFormValueChanges(details))!.current.rawValue).toEqual({city: 'Edited city'});

    refresh.update(value => value + 1);
    expect(observed()!.previous.rawValue).toEqual({city: 'Initial city'});
    expect(observed()!.current.rawValue).toEqual({city: 'Edited city'});
  });

  it('exposes programmatic changes without inventing a baseline before the first UI change', () => {
    const rootChanges = getFormValueChanges$(form);
    const nestedChanges = getFormValueChanges$(details);
    const previous = snapshot(form);

    form.patchValue({name: 'Loaded name', details: {city: 'Loaded city'}});
    setRootFormValueChanges(form, changes<TestControls>(previous, snapshot(form)));

    expect(rootChanges()?.current.rawValue).toEqual(form.getRawValue());
    expect(nestedChanges()?.current.rawValue).toEqual({city: 'Loaded city'});
    expect(rootChanges()?.beforeUserChange).toBeUndefined();
    expect(nestedChanges()?.beforeUserChange).toBeUndefined();
    expect(getFormValueChanges(form)?.beforeUserChange).toBeUndefined();
    expect(getFormValueChanges(details)?.beforeUserChange).toBeUndefined();
  });

  it('retains and projects the first UI baseline when later changes replace the latest event', () => {
    const rootChanges = getFormValueChanges$<TestControls, never>(form);
    const nestedChanges = getFormValueChanges$(details);
    const initial = snapshot(form);
    form.patchValue({name: 'Loaded name', details: {city: 'Loaded city'}});
    setRootFormValueChanges(form, changes<TestControls>(initial, snapshot(form)));

    const baseline = snapshot(form);
    details.controls.city.setValue('First edit');
    const firstUiChange = changes<TestControls>(baseline, snapshot(form), true, true);
    setRootBeforeUserChange(form, firstUiChange);
    setRootFormValueChanges(form, firstUiChange);

    const previous = snapshot(form);
    form.patchValue({name: 'Later name', details: {city: 'Later city'}});
    setRootFormValueChanges(form, changes<TestControls>(previous, snapshot(form)));

    expect(rootChanges()?.beforeUserChange).toEqual(baseline);
    expect(rootChanges()?.firstUiChange).toBe(false);
    expect(nestedChanges()?.beforeUserChange).toEqual({
      rawValue: {city: 'Loaded city'},
      value: {city: 'Loaded city'},
    });
    expect(nestedChanges()?.previous.rawValue).toEqual({city: 'First edit'});
    expect(nestedChanges()?.current.rawValue).toEqual({city: 'Later city'});
    expect(getFormValueChanges<TestControls, never>(form)).toEqual(rootChanges());
    expect(getFormValueChanges(details)).toEqual(nestedChanges());
  });

  it('preserves a disabled nested group baseline with an empty enabled value', () => {
    details.disable({emitEvent: false});
    const baseline = snapshot(form);
    expect(baseline.value).toEqual({name: 'Initial name'});

    form.controls.name.setValue('Edited name');
    const firstUiChange = changes<TestControls>(baseline, snapshot(form), true, true);
    setRootBeforeUserChange(form, firstUiChange);
    setRootFormValueChanges(form, firstUiChange);

    expect(getFormValueChanges(details)?.beforeUserChange).toEqual({
      rawValue: {city: 'Initial city'},
      value: {},
    });
    expect(getFormValueChanges$(details)()).toEqual(getFormValueChanges(details));
  });

  it('leaves the baseline undefined for a group added after the root baseline was captured', () => {
    const dynamicForm = new FormGroup({
      name: new FormControl('Initial name', {nonNullable: true}),
      rows: new FormArray<FormGroup<DetailsControls>>([]),
    });
    type DynamicControls = typeof dynamicForm.controls;
    const baseline = {rawValue: dynamicForm.getRawValue(), value: dynamicForm.value};
    dynamicForm.controls.name.setValue('Edited name');
    const firstUiChange = changes<DynamicControls>(baseline, {
      rawValue: dynamicForm.getRawValue(), value: dynamicForm.value,
    }, true, true);
    setRootBeforeUserChange(dynamicForm, firstUiChange);
    setRootFormValueChanges(dynamicForm, firstUiChange);

    const previous = {rawValue: dynamicForm.getRawValue(), value: dynamicForm.value};
    const addedDetails = new FormGroup({city: new FormControl('Added city', {nonNullable: true})});
    dynamicForm.controls.rows.push(addedDetails);
    setRootFormValueChanges(dynamicForm, changes<DynamicControls>(previous, {
      rawValue: dynamicForm.getRawValue(), value: dynamicForm.value,
    }));

    expect(getFormValueChanges(addedDetails)?.current.rawValue).toEqual({city: 'Added city'});
    expect(getFormValueChanges(addedDetails)?.beforeUserChange).toBeUndefined();
    expect(getFormValueChanges$(addedDetails)()?.beforeUserChange).toBeUndefined();
    expect(getFormValueChanges<DynamicControls, never>(dynamicForm)?.beforeUserChange).toEqual(baseline);
  });
});

describe('form value projections preserve group identity', () => {
  const row = (name: string) => new FormGroup({name: new FormControl(name, {nonNullable: true})});

  function createRows() {
    const a = row('A');
    const b = row('B');
    const c = row('C');
    const rows = new FormArray([a, b, c]);
    const form = new FormGroup({rows, archive: new FormArray<typeof b>([])});
    return {a, b, c, rows, form, history: recordHistory(form)};
  }

  it('preserves complete root events, snapshot references and flags', () => {
    const {b, form, history} = createRows();
    const rootSignal = getRootFormValueChanges$(b);
    const rootProjection = getFormValueChanges$(form);
    const event = history.record(() => b.controls.name.setValue('B edited'));

    expect(getRootFormValueChanges(b)).toBe(event);
    expect(rootSignal()).toBe(event);
    expect(rootProjection()).toEqual({...event, beforeUserChange: event.previous});
    expect(rootProjection()!.previous).toBe(event.previous);
    expect(rootProjection()!.current).toBe(event.current);
    expect(rootProjection()!.beforeUserChange).toBe(event.previous);
    expect(getRootFormInitialValue(form)).toBe(history.initial.rawValue);
  });

  it.each(['remove-before', 'insert-before', 'reorder'] as const)(
    'keeps previous, current and first UI baseline attached to B after %s', operation => {
      const {a, b, rows, history} = createRows();
      const observed = getFormValueChanges$(b);
      const event = history.record(() => {
        if (operation === 'remove-before') rows.removeAt(0);
        if (operation === 'insert-before') rows.insert(0, row('new'));
        if (operation === 'reorder') {
          rows.removeAt(0, {emitEvent: false});
          rows.insert(2, a);
        }
      });
      const expected = {
        ...event,
        previous: {rawValue: {name: 'B'}, value: {name: 'B'}},
        current: {rawValue: {name: 'B'}, value: {name: 'B'}},
        beforeUserChange: {rawValue: {name: 'B'}, value: {name: 'B'}}
      };

      expect(observed()).toEqual(expected);
      expect(getFormValueChanges(b)).toEqual(expected);
      expect(getFormInitialValue(b)).toEqual({name: 'B'});
    }
  );

  it('preserves history when B moves between arrays within the same root', () => {
    const {b, rows, form, history} = createRows();
    const observed = getFormValueChanges$(b);
    history.record(() => {
      rows.removeAt(1, {emitEvent: false});
      form.controls.archive.push(b);
    });

    expect(observed()!.previous.rawValue).toEqual({name: 'B'});
    expect(observed()!.current.rawValue).toEqual({name: 'B'});
    expect(observed()!.beforeUserChange!.rawValue).toEqual({name: 'B'});
    expect(getFormValueChanges(b)).toEqual(observed());
    expect(getFormInitialValue(b)).toEqual({name: 'B'});
  });

  it('returns undefined for a removed group and recovers when the same group is re-added', () => {
    const {b, c, rows, history} = createRows();
    const observed = getFormValueChanges$(b);
    history.record(() => rows.removeAt(1));

    expect(observed()).toBeUndefined();
    expect(getFormValueChanges(b)).toBeUndefined();
    expect(getFormValueChanges(c)!.previous.rawValue).toEqual({name: 'C'});
    expect(getFormInitialValue(b)).toEqual({name: 'B'});

    history.record(() => rows.push(b));
    expect(observed()!.previous).toEqual({rawValue: {}, value: {}});
    expect(observed()!.current).toEqual({rawValue: {name: 'B'}, value: {name: 'B'}});
    expect(observed()!.beforeUserChange!.rawValue).toEqual({name: 'B'});
    expect(getFormInitialValue(b)).toEqual({name: 'B'});
  });

  it.each(['insert', 'replace'] as const)(
    'does not invent previous, baseline or initial values for a new group after %s', operation => {
      const {b, rows, history} = createRows();
      history.record(() => b.controls.name.setValue('B edited'));
      const added = row('new');
      history.record(() => {
        if (operation === 'insert') rows.insert(1, added);
        else rows.setControl(1, added);
      });

      const fresh = getFormValueChanges(added)!;
      expect(fresh.previous).toEqual({rawValue: {}, value: {}});
      expect(fresh.current).toEqual({rawValue: {name: 'new'}, value: {name: 'new'}});
      expect(fresh.beforeUserChange).toBeUndefined();
      expect(getFormValueChanges$(added)()).toEqual(fresh);
      expect(getFormInitialValue(added)).toEqual({});
    }
  );

  it('keeps enabled value and raw value aligned when preceding rows are disabled', () => {
    const {a, b, history} = createRows();
    const observed = getFormValueChanges$(b);
    history.record(() => disableControl('test', a));

    expect(observed()!.current).toEqual({rawValue: {name: 'B'}, value: {name: 'B'}});
    expect(getFormValueChanges(b)).toEqual(observed());
    history.record(() => enableControl('test', a));
    expect(observed()!.previous).toEqual({rawValue: {name: 'B'}, value: {name: 'B'}});
  });

  it('projects an omitted disabled group as an empty enabled value while preserving its raw value', () => {
    const {b, history} = createRows();
    const observed = getFormValueChanges$(b);
    history.record(() => disableControl('test', b));

    expect(observed()!.current).toEqual({rawValue: {name: 'B'}, value: {}});
    history.record(() => enableControl('test', b));
    expect(observed()!.previous).toEqual({rawValue: {name: 'B'}, value: {}});
    expect(observed()!.current).toEqual({rawValue: {name: 'B'}, value: {name: 'B'}});
  });

  it('preserves Angular value semantics when the entire root is disabled', () => {
    const {b, form, history} = createRows();
    const observed = getFormValueChanges$(b);
    history.record(() => disableControl('test', form));

    expect(observed()!.current).toEqual({rawValue: {name: 'B'}, value: {name: 'B'}});
    expect(getFormValueChanges(form)!.current.value).toEqual(form.value);
  });

  it('tracks nested groups through multiple arrays with independently omitted disabled rows', () => {
    const target = new FormGroup({
      name: new FormControl('target', {nonNullable: true}),
      omitted: new FormControl({value: 'raw only', disabled: true}, {nonNullable: true})
    });
    const section = (rows: FormGroup[]) => new FormGroup({rows: new FormArray(rows)});
    const skippedSection = section([row('outer disabled')]);
    const skippedRow = row('inner disabled');
    const activeSection = section([skippedRow, target]);
    const form = new FormGroup({sections: new FormArray([skippedSection, activeSection])});
    const history = recordHistory(form);
    const observed = getFormValueChanges$(target);
    history.record(() => {
      disableControl('test', skippedSection);
      disableControl('test', skippedRow);
    });

    expect(observed()!.current).toEqual({
      rawValue: {name: 'target', omitted: 'raw only'}, value: {name: 'target'}
    });
    expect(getFormValueChanges(target)).toEqual(observed());
  });

  it('does not clone or coerce atomic values, null or undefined inside group snapshots', () => {
    const date = new Date('2026-10-23T12:00:00Z');
    const object = {code: 42};
    const makeGroup = () => new FormGroup({
      date: new FormControl(date, {nonNullable: true}),
      object: new FormControl(object, {nonNullable: true}),
      nullable: new FormControl<string | null>(null),
      optional: new FormControl<string | undefined>({value: undefined, disabled: false}, {nonNullable: true})
    });
    const first = makeGroup();
    const target = makeGroup();
    const rows = new FormArray([first, target]);
    const history = recordHistory(new FormGroup({rows}));
    const observed = getFormValueChanges$(target);
    history.record(() => rows.removeAt(0));

    const projected = observed()!;
    expect(projected.current.rawValue).toStrictEqual({date, object, nullable: null, optional: undefined});
    expect(projected.current.value).toStrictEqual({date, object, nullable: null, optional: undefined});
    expect(projected.current.rawValue.date).toBe(date);
    expect(projected.current.rawValue.object).toBe(object);
    expect(projected.current.value.date).toBe(date);
    expect(projected.current.value.object).toBe(object);
    expect(Object.hasOwn(projected.current.rawValue, 'optional')).toBe(true);
    expect(projected.previous.rawValue.date).toBe(date);
  });

  it('retains earlier snapshots and reuses their original subtree references across edits', () => {
    const {b, history} = createRows();
    const observed = getFormValueChanges$(b);
    const firstEvent = history.record(() => b.controls.name.setValue('first edit'));
    const firstProjection = observed()!;
    const secondEvent = history.record(() => b.controls.name.setValue('second edit'));
    const secondProjection = observed()!;

    expect(firstProjection.current.rawValue).toBe(firstEvent.current.rawValue.rows[1]);
    expect(firstProjection.current.value).toBe(firstEvent.current.value.rows![1]);
    expect(firstProjection.current.rawValue).toEqual({name: 'first edit'});
    expect(secondProjection.previous.rawValue).toBe(firstProjection.current.rawValue);
    expect(secondProjection.previous.value).toBe(firstProjection.current.value);
    expect(secondProjection.current.rawValue).toBe(secondEvent.current.rawValue.rows[1]);
    expect(secondProjection.current.value).toBe(secondEvent.current.value.rows![1]);
    expect(secondProjection.beforeUserChange!.rawValue).toBe(history.initial.rawValue.rows[1]);
    expect(secondProjection.beforeUserChange!.value).toBe(history.initial.value.rows![1]);
    expect(getFormInitialValue(b)).toBe(history.initial.rawValue.rows[1]);
  });

  it('handles groups inside directly nested FormArrays with independently omitted elements', () => {
    const target = row('target');
    const outerSkipped = new FormArray([row('outer skipped')]);
    const innerSkipped = row('inner skipped');
    const active = new FormArray([innerSkipped, target]);
    const matrix = new FormArray([outerSkipped, active]);
    const history = recordHistory(new FormGroup({matrix}));
    const observed = getFormValueChanges$(target);
    history.record(() => {
      disableControl('test', outerSkipped);
      disableControl('test', innerSkipped);
    });

    expect(observed()!.current).toEqual({rawValue: {name: 'target'}, value: {name: 'target'}});
    expect(getFormValueChanges(target)).toEqual(observed());
    expect(getFormInitialValue(target)).toEqual({name: 'target'});
  });
});

/** Records explicit root snapshots before and after each operation, without Angular directives. */
function recordHistory<T extends {[K in keyof T]: AbstractControl}>(form: FormGroup<T>) {
  const takeSnapshot = (): FormValues<T, never> => ({
    value: form.value,
    rawValue: form.getRawValue() as FormValues<T, never>['rawValue']
  });
  const initial = takeSnapshot();
  let previous = initial;
  let firstUiChange = true;
  setRootFormInitialValue<T, never>(form, initial.rawValue as FormValue<T, never>);
  setRootFormValueChanges(form, changes<T>(initial, initial));

  return {
    initial,
    record(operation: () => void) {
      operation();
      const current = takeSnapshot();
      const event = changes<T>(previous, current, true, firstUiChange);
      if (firstUiChange) setRootBeforeUserChange(form, event);
      setRootFormValueChanges(form, event);
      previous = current;
      firstUiChange = false;
      return event;
    }
  };
}

function snapshot(form: FormGroup<TestControls>): FormValues<TestControls, never> {
  return {rawValue: form.getRawValue(), value: form.value};
}

function changes<T>(
  previous: FormValues<T, never>,
  current: FormValues<T, never>,
  uiChange = false,
  firstUiChange = false,
): ValueChanges<T, never> {
  return {previous, current, uiChange, firstUiChange, dataChanged: true, rawDataChanged: true};
}
