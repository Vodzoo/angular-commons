import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {disableControl} from '../disableWithContext';
import {DEFAULT_FORM_MODIFIED_CONFIG, FormModifiedDiffEntry, getDiff} from './form-modified.directive';

const equalFn = DEFAULT_FORM_MODIFIED_CONFIG.equalFn;

describe('getDiff disabled metadata', () => {
  it('distinguishes identically named fields in different groups', () => {
    const left = new FormGroup({name: new FormControl('before', {nonNullable: true})});
    const right = new FormGroup({name: new FormControl('before', {nonNullable: true})});
    const form = new FormGroup({left, right});
    const previous = form.getRawValue();
    disableControl('hidden', left.controls.name, {emitEvent: false});
    left.controls.name.setValue('after', {emitEvent: false});
    right.controls.name.setValue('after', {emitEvent: false});

    const diffs = getDiff({previous, current: form.getRawValue(), equalFn, form});

    expect(diffs.map(({path, disabled}) => ({path, disabled}))).toEqual([
      {path: ['left', 'name'], disabled: true},
      {path: ['right', 'name'], disabled: false},
    ]);
  });

  it('distinguishes a dotted control name from a nested path', () => {
    const literal = new FormControl('before', {nonNullable: true});
    const nested = new FormControl('before', {nonNullable: true});
    const form = new FormGroup({'a.b': literal, a: new FormGroup({b: nested})});
    const previous = form.getRawValue();
    disableControl('hidden', literal, {emitEvent: false});
    literal.setValue('after', {emitEvent: false});
    nested.setValue('after', {emitEvent: false});

    const diffs = getDiff({previous, current: form.getRawValue(), equalFn, form});

    expect(diffs.map(({path, pathString, disabled}) => ({path, pathString, disabled}))).toEqual([
      {path: ['a.b'], pathString: 'a.b', disabled: true},
      {path: ['a', 'b'], pathString: 'a.b', disabled: false},
    ]);
  });

  it('uses physical FormArray indices beneath nested groups, including disabled elements', () => {
    const items = new FormArray([
      new FormControl('first', {nonNullable: true}),
      new FormControl('second', {nonNullable: true}),
    ]);
    const form = new FormGroup({details: new FormGroup({items})});
    const previous = form.getRawValue();
    disableControl('hidden', items.at(0), {emitEvent: false});
    items.setValue(['changed first', 'changed second'], {emitEvent: false});

    expect(getDiff({previous, current: form.getRawValue(), equalFn, form})).toEqual([
      {
        path: ['details', 'items', 0], pathString: 'details.items.0',
        previousValue: 'first', currentValue: 'changed first', disabled: true,
      },
      {
        path: ['details', 'items', 1], pathString: 'details.items.1',
        previousValue: 'second', currentValue: 'changed second', disabled: false,
      },
    ]);
  });

  it('uses the owning FormControl state for a path inside its object value', () => {
    const profile = new FormControl({address: {city: 'before'}}, {nonNullable: true});
    const form = new FormGroup({profile, other: new FormControl('same', {nonNullable: true})});
    const previous = form.getRawValue();
    disableControl('hidden', profile, {emitEvent: false});
    profile.setValue({address: {city: 'after'}}, {emitEvent: false});
    expect(form.disabled).toBe(false);

    expect(getDiff({previous, current: form.getRawValue(), equalFn, form})).toEqual([
      {
        path: ['profile', 'address', 'city'], pathString: 'profile.address.city',
        previousValue: 'before', currentValue: 'after', disabled: true,
      },
    ]);
  });

  it('keeps a removed field difference with unknown disabled state', () => {
    const form = new FormGroup({present: new FormControl('same')});
    const diffs = getDiff({
      previous: {present: 'same', removed: 'before'},
      current: form.getRawValue(),
      equalFn,
      form,
    });

    expect(diffs).toEqual([
      {
        path: ['removed'], pathString: 'removed',
        previousValue: 'before', currentValue: undefined, disabled: undefined,
      },
    ]);
  });

  it('keeps snapshot differences when an intermediate array control no longer exists', () => {
    const items = new FormArray([
      new FormGroup({name: new FormControl('unchanged', {nonNullable: true})}),
      new FormGroup({name: new FormControl('before', {nonNullable: true})}),
    ]);
    const form = new FormGroup({items});
    const previous = form.getRawValue();
    items.at(1).controls.name.setValue('after', {emitEvent: false});
    const current = form.getRawValue();
    items.removeAt(1, {emitEvent: false});

    let diffs: FormModifiedDiffEntry[] = [];
    expect(() => {
      diffs = getDiff({previous, current, equalFn, form});
    }).not.toThrow();
    expect(diffs).toEqual([
      {
        path: ['items', 1, 'name'], pathString: 'items.1.name',
        previousValue: 'before', currentValue: 'after', disabled: undefined,
      },
    ]);
  });

  it('still compares standalone values without a form', () => {
    const diffs = getDiff({previous: {name: 'before'}, current: {name: 'after'}, equalFn});

    expect(diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'before', currentValue: 'after'},
    ]);
    expect(diffs[0].disabled).toBeUndefined();
  });

  it('uses the root control state when the difference has an empty path', () => {
    const form = new FormGroup({name: new FormControl('current')});
    disableControl('readonly', form, {emitEvent: false});

    expect(getDiff({previous: null, current: form.getRawValue(), equalFn, form})).toEqual([
      {
        path: [], pathString: '', previousValue: null,
        currentValue: {name: 'current'}, disabled: true,
      },
    ]);
  });
});
