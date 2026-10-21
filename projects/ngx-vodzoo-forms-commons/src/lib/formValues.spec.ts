import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {FormValues, ValueChanges} from './directives/form.directive';
import {setRootBeforeUserChange} from './formModified';
import {getFormValueChanges, getFormValueChanges$, setRootFormValueChanges} from './formValues';

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
    expect(rootChanges()?.firstUiChange).toBeFalse();
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
