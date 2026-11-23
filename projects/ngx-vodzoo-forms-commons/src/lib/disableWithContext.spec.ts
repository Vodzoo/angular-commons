import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {ControlValueAccessor, FormArray, FormControl, FormGroup, NG_VALUE_ACCESSOR, ReactiveFormsModule, Validators} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {describe, expect, it, vi} from 'vitest';
import {
  disableControl,
  enableControl,
  forceEnableControl,
  getDisablingContexts,
  isControlForceEnabled,
  resetForceEnableControl,
  switchDisable
} from './disableWithContext';
import {isDataChangedByUi, resetUiChange} from './directives/form-field.directive';
import {isFormGroupDisabled$} from './formDisabled';

@Component({
  selector: 'test-disabled-state-field',
  standalone: true,
  template: '',
  providers: [{provide: NG_VALUE_ACCESSOR, useExisting: DisabledStateFieldComponent, multi: true}]
})
class DisabledStateFieldComponent implements ControlValueAccessor {
  onDisable = () => {};

  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}

  setDisabledState(disabled: boolean): void {
    if (disabled) {
      this.onDisable();
    }
  }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DisabledStateFieldComponent],
  template: '<test-disabled-state-field [formControl]="group.controls.first" />'
})
class DisabledStateHostComponent {
  readonly group = new FormGroup({
    first: new FormControl('first'),
    sibling: new FormControl('initial')
  });
}

describe('switchDisable', () => {
  it('evaluates the condition once per call and emits only when the state changes', () => {
    const control = new FormControl('value');
    const condition = vi.fn(() => true);
    const statuses = vi.fn();
    control.statusChanges.subscribe(statuses);

    switchDisable(condition, 'readOnly', control);
    switchDisable(condition, 'readOnly', control);
    condition.mockReturnValue(false);
    switchDisable(condition, 'readOnly', control);
    switchDisable(condition, 'readOnly', control);

    expect(condition).toHaveBeenCalledTimes(4);
    expect(statuses.mock.calls).toEqual([['DISABLED'], ['VALID']]);
    expect(getDisablingContexts(control)).toEqual([]);
  });

  it('updates a nested group and its ancestors, including validation on re-enable', () => {
    const required = new FormControl('', Validators.required);
    const empty = new FormArray([]);
    const nested = new FormGroup({required, empty});
    const root = new FormGroup({nested, other: new FormControl('value')});
    const disabled = isFormGroupDisabled$(nested);
    const rootStatuses = vi.fn();
    const nestedStatuses = vi.fn();
    root.statusChanges.subscribe(rootStatuses);
    nested.statusChanges.subscribe(nestedStatuses);

    expect(root.status).toBe('INVALID');
    switchDisable(() => true, 'readOnly', nested);
    expect([required.status, empty.status, nested.status, root.status])
      .toEqual(['DISABLED', 'DISABLED', 'DISABLED', 'VALID']);
    expect(root.value).toEqual({other: 'value'});
    expect(disabled()).toBe(true);
    expect(getDisablingContexts(nested)).toEqual(['readOnly']);
    expect(getDisablingContexts(required)).toEqual([]);

    switchDisable(() => false, 'readOnly', nested);
    expect([required.status, empty.status, nested.status, root.status])
      .toEqual(['INVALID', 'VALID', 'INVALID', 'INVALID']);
    expect(disabled()).toBe(false);
    expect(nestedStatuses.mock.calls).toEqual([['DISABLED'], ['INVALID']]);
    expect(rootStatuses.mock.calls).toEqual([['VALID'], ['INVALID']]);
  });

  it.each(['onlySelf', 'emitEvent'] as const)('honors %s on a subgroup', option => {
    const field = new FormControl('value');
    const nested = new FormGroup({field});
    const root = new FormGroup({nested});
    const rootEvents = vi.fn();
    const subtreeEvents = vi.fn();
    root.valueChanges.subscribe(rootEvents);
    root.statusChanges.subscribe(rootEvents);
    nested.valueChanges.subscribe(subtreeEvents);
    nested.statusChanges.subscribe(subtreeEvents);
    field.valueChanges.subscribe(subtreeEvents);
    field.statusChanges.subscribe(subtreeEvents);
    const options = option === 'onlySelf' ? {onlySelf: true} : {emitEvent: false};

    switchDisable(() => true, 'readOnly', nested, options);
    expect([field.status, nested.status, root.status])
      .toEqual(['DISABLED', 'DISABLED', option === 'onlySelf' ? 'VALID' : 'DISABLED']);
    switchDisable(() => false, 'readOnly', nested, options);

    expect([field.status, nested.status, root.status]).toEqual(['VALID', 'VALID', 'VALID']);
    expect(rootEvents).not.toHaveBeenCalled();
    expect(subtreeEvents).toHaveBeenCalledTimes(option === 'onlySelf' ? 8 : 0);
  });

  it.each([true, false])('marks group events as UI changes when disabled is %s', disabled => {
    const group = new FormGroup({field: new FormControl('value')});
    if (!disabled) {
      switchDisable(() => true, 'readOnly', group);
    }
    const statuses = vi.fn();
    group.statusChanges.subscribe(status => statuses(status, isDataChangedByUi(group)));

    switchDisable(() => disabled, 'readOnly', group, {markAsUiChange: true});

    expect(statuses.mock.calls).toEqual([[disabled ? 'DISABLED' : 'VALID', true]]);
    resetUiChange(group);
    switchDisable(() => !disabled, 'readOnly', group, {markAsUiChange: true, emitEvent: false});
    expect(isDataChangedByUi(group)).toBe(false);
    expect(statuses).toHaveBeenCalledTimes(1);
  });

  it('calls the value accessor during a silent group disable before the sibling is disabled', () => {
    const fixture = TestBed.createComponent(DisabledStateHostComponent);
    fixture.detectChanges();
    const group = fixture.componentInstance.group;
    const {first, sibling} = group.controls;
    const field: DisabledStateFieldComponent = fixture.debugElement.query(By.directive(DisabledStateFieldComponent)).componentInstance;
    const callbackStatuses = vi.fn();
    const groupStatuses = vi.fn();
    group.statusChanges.subscribe(groupStatuses);
    field.onDisable = () => {
      callbackStatuses(group.status, sibling.status);
      sibling.patchValue('derived');
    };

    switchDisable(() => true, 'readOnly', group, {emitEvent: false});

    expect(callbackStatuses.mock.calls).toEqual([['DISABLED', 'VALID']]);
    expect(sibling.value).toBe('derived');
    expect([first.status, sibling.status]).toEqual(['DISABLED', 'DISABLED']);
    expect(groupStatuses.mock.calls).toEqual([['VALID']]);
    expect(group.status).toBe('VALID');
  });
});

describe('disabling contexts', () => {
  it('keeps a group disabled until the last context is cleared', () => {
    const group = new FormGroup({field: new FormControl('value')});
    const statuses = vi.fn();
    group.statusChanges.subscribe(statuses);
    disableControl('readOnly', group);
    disableControl('permission', group);
    enableControl('readOnly', group, {force: true});

    expect(group.disabled).toBe(true);
    expect(getDisablingContexts(group)).toEqual(['permission']);

    enableControl('permission', group);
    expect(group.enabled).toBe(true);
    expect(statuses.mock.calls).toEqual([['DISABLED'], ['VALID']]);
  });

  it('re-enables a required field through its group while retaining the separate field context', () => {
    const required = new FormControl('', Validators.required);
    const group = new FormGroup({required, other: new FormControl('value')});
    disableControl('fieldRule', required);
    expect(group.status).toBe('VALID');
    expect(required.status).toBe('DISABLED');

    switchDisable(() => true, 'readOnly', group);
    expect(group.status).toBe('DISABLED');
    expect(getDisablingContexts(group)).toEqual(['readOnly']);
    expect(getDisablingContexts(required)).toEqual(['fieldRule']);

    switchDisable(() => false, 'readOnly', group);
    expect([required.status, group.status]).toEqual(['INVALID', 'INVALID']);
    expect(getDisablingContexts(group)).toEqual([]);
    expect(getDisablingContexts(required)).toEqual(['fieldRule']);
  });

  it.each([true, false])('requires force=%s to clear an external disable', force => {
    const control = new FormControl({value: 'value', disabled: true});
    disableControl('readOnly', control);
    enableControl('readOnly', control, {force});

    expect(control.enabled).toBe(force);
    expect(getDisablingContexts(control)).toEqual(force ? [] : ['__unknown__']);
  });

  it('records an external disable on the first enable attempt without force', () => {
    const control = new FormControl({value: 'value', disabled: true});
    const statuses = vi.fn();
    control.statusChanges.subscribe(statuses);

    enableControl('readOnly', control);

    expect(control.disabled).toBe(true);
    expect(getDisablingContexts(control)).toEqual(['__unknown__']);
    expect(statuses).not.toHaveBeenCalled();
  });

  it('rejects the reserved context without changing the control', () => {
    const control = new FormControl('value');
    expect(() => disableControl('__unknown__', control)).toThrow('Forbidden context name!');
    expect(control.enabled).toBe(true);
    expect(getDisablingContexts(control)).toEqual([]);
  });

  it('restores group blocking contexts after force-enable is reset', () => {
    const group = new FormGroup({field: new FormControl('value')});
    disableControl('readOnly', group);
    forceEnableControl(group);
    expect(isControlForceEnabled(group)).toBe(true);
    expect(group.enabled).toBe(true);

    disableControl('permission', group);
    enableControl('readOnly', group);
    expect(group.controls.field.enabled).toBe(true);
    expect(getDisablingContexts(group)).toEqual(['permission']);

    resetForceEnableControl(group);
    expect(isControlForceEnabled(group)).toBe(false);
    expect(group.controls.field.disabled).toBe(true);
    expect(group.disabled).toBe(true);
  });
});

describe('force-enable transitions', () => {
  it('sets the override on an enabled control without emitting', () => {
    const control = new FormControl('value');
    const statuses = vi.fn();
    control.statusChanges.subscribe(statuses);

    forceEnableControl(control, {markAsUiChange: true});

    expect(isControlForceEnabled(control)).toBe(true);
    expect(control.enabled).toBe(true);
    expect(statuses).not.toHaveBeenCalled();
    expect(isDataChangedByUi(control)).toBe(false);
  });

  it('clears the override without disabling a control with no blocking context', () => {
    const control = new FormControl('value');
    forceEnableControl(control);
    const statuses = vi.fn();
    control.statusChanges.subscribe(statuses);

    resetForceEnableControl(control);

    expect(isControlForceEnabled(control)).toBe(false);
    expect(control.enabled).toBe(true);
    expect(statuses).not.toHaveBeenCalled();
  });

  it('clears the override without emitting when the control is already disabled', () => {
    const control = new FormControl('value');
    disableControl('readOnly', control);
    forceEnableControl(control);
    control.disable();
    const statuses = vi.fn();
    control.statusChanges.subscribe(statuses);

    resetForceEnableControl(control);

    expect(isControlForceEnabled(control)).toBe(false);
    expect(control.disabled).toBe(true);
    expect(getDisablingContexts(control)).toEqual(['readOnly']);
    expect(statuses).not.toHaveBeenCalled();
  });

  const eventOptions = [
    {emitEvent: true, markAsUiChange: true, expectedFromUi: true},
    {emitEvent: true, markAsUiChange: false, expectedFromUi: false},
    {emitEvent: false, markAsUiChange: true, expectedFromUi: false},
  ];

  it.each(eventOptions)('force-enables with emitEvent=$emitEvent and markAsUiChange=$markAsUiChange',
    ({emitEvent, markAsUiChange, expectedFromUi}) => {
      const control = new FormControl({value: 'value', disabled: true});
      const statuses = vi.fn();
      control.statusChanges.subscribe(status => statuses(status, isDataChangedByUi(control)));

      forceEnableControl(control, {emitEvent, markAsUiChange});

      expect(control.enabled).toBe(true);
      expect(statuses.mock.calls).toEqual(emitEvent ? [['VALID', expectedFromUi]] : []);
      expect(isDataChangedByUi(control)).toBe(expectedFromUi);
    }
  );

  it.each(eventOptions)('resets the override with emitEvent=$emitEvent and markAsUiChange=$markAsUiChange',
    ({emitEvent, markAsUiChange, expectedFromUi}) => {
      const control = new FormControl('value');
      disableControl('readOnly', control);
      forceEnableControl(control);
      const statuses = vi.fn();
      control.statusChanges.subscribe(status => statuses(status, isDataChangedByUi(control)));

      resetForceEnableControl(control, {emitEvent, markAsUiChange});

      expect(control.disabled).toBe(true);
      expect(statuses.mock.calls).toEqual(emitEvent ? [['DISABLED', expectedFromUi]] : []);
      expect(isDataChangedByUi(control)).toBe(expectedFromUi);
    }
  );
});

describe('switchDisable with synchronous form logic', () => {
  function runLogic(target: 'group' | 'fields') {
    const first = new FormControl('first');
    const last = new FormControl('last');
    const group = new FormGroup({first, last});
    const root = new FormGroup({group, trigger: new FormControl(false)});
    const groupStatuses: string[] = [];
    const snapshots: Array<{group: string; last: string}> = [];
    const maxRuns = 5;
    let calls = 0;
    let limitReached = false;

    function logic() {
      if (++calls > maxRuns) {
        limitReached = true;
        return;
      }
      if (group.disabled && last.enabled) {
        last.patchValue('derived');
      }
      if (target === 'group') {
        switchDisable(() => true, 'readOnly', group);
      } else {
        switchDisable(() => true, 'readOnly', first, {emitEvent: false});
        switchDisable(() => true, 'readOnly', last, {emitEvent: true});
      }
    }

    first.valueChanges.subscribe(() => {
      snapshots.push({group: group.status, last: last.status});
      logic();
    });
    group.statusChanges.subscribe(status => groupStatuses.push(status));
    root.valueChanges.subscribe(logic);
    root.controls.trigger.setValue(true);

    return {calls, limitReached, snapshots, groupStatuses, status: group.status, value: last.value};
  }

  it('re-enters group disable when the first child handler patches a still-enabled sibling', () => {
    const result = runLogic('group');

    expect(result.limitReached).toBe(true);
    expect(result.snapshots).toEqual([
      {group: 'DISABLED', last: 'VALID'},
      {group: 'DISABLED', last: 'VALID'},
      {group: 'DISABLED', last: 'VALID'}
    ]);
    expect(result.groupStatuses.slice(0, 2)).toEqual(['VALID', 'VALID']);
    expect(result.value).toBe('derived');
  });

  it('reruns logic and settles when only the last field emits', () => {
    expect(runLogic('fields')).toEqual({
      calls: 2,
      limitReached: false,
      snapshots: [],
      groupStatuses: ['DISABLED'],
      status: 'DISABLED',
      value: 'last'
    });
  });

  it('does not emit at the end of the field loop if the last field is already disabled', () => {
    const first = new FormControl('first');
    const last = new FormControl('last');
    const group = new FormGroup({first, last});
    switchDisable(() => true, 'readOnly', last);
    const values = vi.fn();
    const statuses = vi.fn();
    group.valueChanges.subscribe(values);
    group.statusChanges.subscribe(statuses);

    switchDisable(() => true, 'readOnly', first, {emitEvent: false});
    switchDisable(() => true, 'readOnly', last, {emitEvent: true});

    expect(group.status).toBe('DISABLED');
    expect(values).not.toHaveBeenCalled();
    expect(statuses).not.toHaveBeenCalled();
  });
});
