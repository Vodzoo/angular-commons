import {computed, untracked} from '@angular/core';
import {FormArray, FormControl, FormGroup, AbstractControl} from '@angular/forms';
import {beforeEach, describe, expect, it} from 'vitest';
import {FormValues, ValueChanges} from './directives/form.directive';
import {setRootBeforeUserChange} from './formModified';
import {
  captureFormValues,
  getFormInitialValue,
  getFormValueChanges,
  getFormValueChanges$,
  getRootFormInitialValue,
  getRootFormValueChanges,
  getRootFormValueChanges$,
  setRootFormInitialValue,
  setRootFormValueChanges
} from './formValues';

type RowControls = {name: FormControl<string>; amount: FormControl<number>};
type Row = FormGroup<RowControls>;
type RootControls = {
  title: FormControl<string>;
  rows: FormArray<Row>;
  details: FormGroup<{city: FormControl<string>}>;
};
type Root = FormGroup<RootControls>;

function row(name: string, amount = 0): Row {
  return new FormGroup({
    name: new FormControl(name, {nonNullable: true}),
    amount: new FormControl(amount, {nonNullable: true})
  });
}

function formFixture(): Root {
  return new FormGroup({
    title: new FormControl('initial', {nonNullable: true}),
    rows: new FormArray([row('A', 1), row('B', 2), row('C', 3)]),
    details: new FormGroup({city: new FormControl('Warszawa', {nonNullable: true})})
  });
}

/** The API requires capture-time indexes; never build manually unindexed snapshots. */
function publish<T extends {[K in keyof T]: AbstractControl}>(
  form: FormGroup<T>,
  previous: FormValues<T, never>,
  uiChange = false,
  firstUiChange = false
): ValueChanges<T, never> {
  const current = captureFormValues<T, never>(form);
  const event: ValueChanges<T, never> = {
    previous, current, uiChange, firstUiChange,
    dataChanged: true, rawDataChanged: true
  };
  if (firstUiChange) setRootBeforeUserChange(form, event);
  setRootFormValueChanges(form, event);
  return event;
}

describe('formValues – capture-time snapshot semantics', () => {
  let form: Root;
  let a: Row;
  let b: Row;
  let c: Row;

  beforeEach(() => {
    form = formFixture();
    [a, b, c] = form.controls.rows.controls;
    setRootFormInitialValue(form, form.getRawValue());
  });

  it('returns undefined before the first published data change', () => {
    expect(getFormValueChanges(form)).toBeUndefined();
    expect(getFormValueChanges(b)).toBeUndefined();
    expect(getFormValueChanges$(b)()).toBeUndefined();
    expect(getRootFormValueChanges(form)).toBeUndefined();
  });

  it('exposes the same root event and the original root snapshot references', () => {
    const previous = captureFormValues<RootControls, never>(form);
    form.controls.title.setValue('next');
    const event = publish(form, previous);
    expect(getRootFormValueChanges(form)).toBe(event);
    expect(getRootFormValueChanges$(b)()).toBe(event);
    expect(getFormValueChanges(form)!.current).toBe(event.current);
    expect(getFormValueChanges(form)!.previous).toBe(event.previous);
  });

  it('keeps existing signals reactive across later changes', () => {
    const root = getFormValueChanges$<RootControls, never>(form);
    const nested = getFormValueChanges$<RowControls, never>(b);
    const first = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    publish(form, first);
    expect(nested()!.current.rawValue).toEqual({name: 'B1', amount: 2});
    const second = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B2');
    publish(form, second);
    expect(nested()!.previous.rawValue).toEqual({name: 'B1', amount: 2});
    expect(nested()!.current.rawValue).toEqual({name: 'B2', amount: 2});
    expect(root()!.current.rawValue.rows[1].name).toBe('B2');
  });

  it('supports computed and explicit untracked reads', () => {
    const projected = computed(() => getFormValueChanges(b)?.current.rawValue.name);
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    publish(form, previous);
    expect(projected()).toBe('B1');
    expect(untracked(() => getFormValueChanges(b)!.current.rawValue.name)).toBe('B1');
  });

  it('preserves original raw subtree references', () => {
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('edited');
    const event = publish(form, previous);
    expect(getFormValueChanges(b)!.previous.rawValue).toBe(event.previous.rawValue.rows[1]);
    expect(getFormValueChanges(b)!.current.rawValue).toBe(event.current.rawValue.rows[1]);
  });

  it('keeps first UI baseline across later changes', () => {
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    const firstEvent = publish(form, previous, true, true);
    expect(getFormValueChanges(b)!.beforeUserChange!.rawValue).toBe(previous.rawValue.rows[1]);
    const afterFirst = captureFormValues<RootControls, never>(form);
    form.controls.title.setValue('changed again');
    publish(form, afterFirst);
    expect(getFormValueChanges(b)!.beforeUserChange!.rawValue).toBe(previous.rawValue.rows[1]);
    expect(getFormValueChanges(form)!.beforeUserChange).toBe(firstEvent.previous);
  });

  it('keeps the baseline undefined before the first UI event', () => {
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    publish(form, previous);
    expect(getFormValueChanges(b)!.beforeUserChange).toBeUndefined();
  });

  it.each(['remove', 'insert', 'reorder'] as const)(
    'preserves B identity and historical values when rows %s before B', operation => {
      const previous = captureFormValues<RootControls, never>(form);
      if (operation === 'remove') form.controls.rows.removeAt(0);
      if (operation === 'insert') form.controls.rows.insert(0, row('X'));
      if (operation === 'reorder') {
        form.controls.rows.removeAt(2, {emitEvent: false});
        form.controls.rows.insert(0, c);
      }
      publish(form, previous);
      const projected = getFormValueChanges(b)!;
      expect(projected.previous.rawValue).toEqual({name: 'B', amount: 2});
      expect(projected.current.rawValue).toEqual({name: 'B', amount: 2});
      expect(getFormInitialValue(b)).toEqual({name: 'B', amount: 2});
    }
  );

  it('does not borrow history from a neighbour when inserting a new row', () => {
    const previous = captureFormValues<RootControls, never>(form);
    const added = row('New');
    form.controls.rows.insert(0, added);
    publish(form, previous);
    expect(getFormValueChanges(added)!.previous).toEqual({rawValue: {}, value: {}});
    expect(getFormValueChanges(added)!.current.rawValue).toEqual({name: 'New', amount: 0});
    expect(getFormInitialValue(added)).toEqual({});
    expect(getFormValueChanges(a)!.previous.rawValue).toEqual({name: 'A', amount: 1});
  });

  it('returns undefined for a removed group and restores it when re-added', () => {
    const first = captureFormValues<RootControls, never>(form);
    form.controls.rows.removeAt(1);
    publish(form, first);
    expect(getFormValueChanges(b)).toBeUndefined();
    expect(getFormInitialValue(b)).toEqual({name: 'B', amount: 2});
    const second = captureFormValues<RootControls, never>(form);
    form.controls.rows.push(b);
    publish(form, second);
    expect(getFormValueChanges(b)!.previous).toEqual({rawValue: {}, value: {}});
    expect(getFormValueChanges(b)!.current.rawValue).toEqual({name: 'B', amount: 2});
  });

  it('does not assign a next enabled sibling to a disabled row', () => {
    const before = captureFormValues<RootControls, never>(form);
    a.disable();
    publish(form, before);
    const eventBefore = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    publish(form, eventBefore);
    expect(getFormValueChanges(b)!.current.value).toEqual({name: 'B1', amount: 2});
    expect(getFormValueChanges(b)!.previous.value).toEqual({name: 'B', amount: 2});
  });

  it('captures the disabled FormGroup own value rather than an empty object', () => {
    b.disable();
    const captured = captureFormValues<RootControls, never>(form);
    expect(captured.value.rows).toEqual([{name: 'A', amount: 1}, {name: 'C', amount: 3}]);
    form.controls.title.setValue('updated');
    publish(form, captured);
    expect(getFormValueChanges(b)!.previous.value).toEqual({name: 'B', amount: 2});
    expect(getFormValueChanges(b)!.current.value).toEqual({name: 'B', amount: 2});
  });

  it('captures nested groups inside a disabled FormArray with their own values', () => {
    form.controls.rows.disable();
    const previous = captureFormValues<RootControls, never>(form);
    form.controls.title.setValue('updated');
    publish(form, previous);
    expect(getFormValueChanges(b)!.previous.value).toEqual({name: 'B', amount: 2});
    expect(getFormValueChanges(b)!.current.value).toEqual({name: 'B', amount: 2});
  });

  it('respects partially disabled child controls when projecting group value', () => {
    b.controls.amount.disable();
    const before = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('edited');
    publish(form, before);
    expect(getFormValueChanges(b)!.previous.value).toEqual({name: 'B'});
    expect(getFormValueChanges(b)!.current.value).toEqual({name: 'edited'});
    expect(getFormValueChanges(b)!.current.rawValue).toEqual({name: 'edited', amount: 2});
  });

  it('does not mistake identical values for identity', () => {
    a.setValue({name: '', amount: 0});
    const previous = captureFormValues<RootControls, never>(form);
    const added = row('', 0);
    form.controls.rows.insert(0, added);
    publish(form, previous);
    expect(getFormValueChanges(a)!.previous.rawValue).toEqual({name: '', amount: 0});
    expect(getFormValueChanges(added)!.previous).toEqual({rawValue: {}, value: {}});
  });

  it('does not invent a baseline for a group added after first user change', () => {
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    publish(form, previous, true, true);
    const added = row('new');
    const next = captureFormValues<RootControls, never>(form);
    form.controls.rows.push(added);
    publish(form, next);
    expect(getFormValueChanges(added)!.beforeUserChange).toBeUndefined();
  });

  it('returns root initial values by reference and row initial values by identity', () => {
    const rootInitial = getRootFormInitialValue<RowControls, never, RootControls>(b);
    expect(getFormInitialValue(form)).toBe(rootInitial);
    expect(getFormInitialValue(b)).toBe(rootInitial.rows![1]);
    form.controls.rows.insert(0, row('new'));
    expect(getFormInitialValue(b)).toEqual({name: 'B', amount: 2});
  });

  it('does not fabricate a history for a replacement group with equal values', () => {
    const previous = captureFormValues<RootControls, never>(form);
    const replacement = row('B', 2);
    form.controls.rows.setControl(1, replacement);
    publish(form, previous);
    expect(getFormValueChanges(replacement)!.previous).toEqual({rawValue: {}, value: {}});
    expect(getFormValueChanges(replacement)!.current.rawValue).toEqual({name: 'B', amount: 2});
    expect(getFormInitialValue(replacement)).toEqual({});
  });

  it('treats a captured snapshot as immutable historical data after later edits', () => {
    const previous = captureFormValues<RootControls, never>(form);
    b.controls.name.setValue('B1');
    const published = publish(form, previous);
    b.controls.name.setValue('B2');
    expect(published.previous.rawValue.rows[1]).toEqual({name: 'B', amount: 2});
    expect(published.current.rawValue.rows[1]).toEqual({name: 'B1', amount: 2});
  });
});
