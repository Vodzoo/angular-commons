import {Component, Injectable, Input, Signal, inject} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {disableControl, enableControl} from '../disableWithContext';
import {getFormInitialValue, getFormValueChanges, getFormValueChanges$} from '../formValues';
import {FormService} from '../services/form.service';
import {
  FormConfigDirective,
  FormControlsLogic,
  FormFieldLogicFnSpecArgsFn,
} from './form-config.directive';
import {markAsUiChange} from './form-field.directive';
import {FormDirective, FormValues, ValueChanges} from './form.directive';

type RowControls = {name: FormControl<string>};
type Row = FormGroup<RowControls>;
type RootControls = {
  trigger: FormControl<string>;
  rows: FormArray<Row>;
  parked: FormArray<Row>;
};
type RowChanges = ValueChanges<RowControls, never> & {beforeUserChange?: FormValues<RowControls, never>};
type RootChanges = ValueChanges<RootControls, never> & {beforeUserChange?: FormValues<RootControls, never>};
type RowRead = {form: Row; fresh: RowChanges | undefined; cached: RowChanges | undefined};
type PreviousRowValues = {
  value: FormValues<RowControls, never>['value'];
  rawValue: Partial<FormValues<RowControls, never>['rawValue']>;
};

function createRow(name: string): Row {
  return new FormGroup({name: new FormControl(name, {nonNullable: true})});
}

function rowValues(name: string): FormValues<RowControls, never> {
  return {value: {name}, rawValue: {name}};
}

function rootValues(
  names: string[],
  parkedNames: string[] = [],
  enabledNames: string[] = names,
): FormValues<RootControls, never> {
  return {
    value: {
      trigger: '',
      rows: enabledNames.map(name => ({name})),
      parked: parkedNames.map(name => ({name})),
    },
    rawValue: {
      trigger: '',
      rows: names.map(name => ({name})),
      parked: parkedNames.map(name => ({name})),
    },
  };
}

@Injectable()
class LogicReads {
  readonly root: Array<{form: FormGroup<RootControls>; fresh: RootChanges | undefined; cached: RootChanges | undefined}> = [];
  readonly rows: RowRead[] = [];
  readonly cachedRows = new WeakMap<Row, Signal<RowChanges | undefined>>();
  cachedRoot?: Signal<RootChanges | undefined>;
}

@Injectable()
class RootLogicService extends FormService<RootControls, never, never> {
  private readonly reads = inject(LogicReads);

  protected override fromGroupConfig(): FormGroup<RootControls> {
    return new FormGroup({
      trigger: new FormControl('', {nonNullable: true}),
      rows: new FormArray([createRow('A0'), createRow('B0'), createRow('C0')]),
      parked: new FormArray<Row>([]),
    });
  }

  protected override formFieldsLogic(): FormControlsLogic<RootControls, never, never> {
    const onInit: FormFieldLogicFnSpecArgsFn<RootControls, never, never> = ({form}) => {
      this.reads.cachedRoot = getFormValueChanges$<RootControls, never>(form);
    };
    const onValueChange: FormFieldLogicFnSpecArgsFn<RootControls, never, never> = ({form}) => {
      this.reads.root.push({
        form,
        fresh: getFormValueChanges<RootControls, never>(form),
        cached: this.reads.cachedRoot?.(),
      });
    };
    return {trigger: spec => {
      spec.onInit?.(onInit);
      spec.onValueChange?.(onValueChange);
    }};
  }
}

@Injectable()
class RowLogicService extends FormService<RowControls, never, never> {
  private readonly reads = inject(LogicReads);

  protected override fromGroupConfig(): Row {
    return createRow('placeholder');
  }

  protected override formFieldsLogic(): FormControlsLogic<RowControls, never, never> {
    const onInit: FormFieldLogicFnSpecArgsFn<RowControls, never, never> = ({form}) => {
      if (!this.reads.cachedRows.has(form)) {
        this.reads.cachedRows.set(form, getFormValueChanges$<RowControls, never>(form));
      }
    };
    const onValueChange: FormFieldLogicFnSpecArgsFn<RowControls, never, never> = ({form}) => {
      this.reads.rows.push({
        form,
        fresh: getFormValueChanges<RowControls, never>(form),
        cached: this.reads.cachedRows.get(form)?.(),
      });
    };
    return {name: spec => {
      spec.onInit?.(onInit);
      spec.onValueChange?.(onValueChange);
    }};
  }
}

@Component({
  selector: 'test-logic-row',
  standalone: true,
  imports: [FormDirective, FormConfigDirective],
  providers: [RowLogicService, {provide: FormService, useExisting: RowLogicService}],
  template: '<section vForm vFormConfig [form]="group" [saveDataWithService]="false"></section>',
})
class RowLogicHost {
  @Input({required: true}) group!: Row;
}

@Component({
  standalone: true,
  imports: [FormDirective, FormConfigDirective, RowLogicHost],
  providers: [RootLogicService, {provide: FormService, useExisting: RootLogicService}],
  template: `
    <main vForm vFormConfig #root="vForm" [saveDataWithService]="false"
          (valueChanged)="events.push($event)">
      @for (row of $any(root.form).controls.rows.controls.concat($any(root.form).controls.parked.controls); track row) {
        <test-logic-row [group]="row" />
      }
    </main>
  `,
})
class RootLogicHost {
  readonly events: ValueChanges<RootControls, never>[] = [];
}

describe('form values in service onValueChange hooks', () => {
  let fixture: ComponentFixture<RootLogicHost>;
  let form: FormGroup<RootControls>;
  let rows: FormArray<Row>;
  let target: Row;
  let reads: LogicReads;

  const initial = rootValues(['A0', 'B0', 'C0']);
  const beforeOperation = rootValues(['A0', 'B1', 'C0']);

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  function clearReads(): void {
    fixture.componentInstance.events.length = 0;
    reads.root.length = 0;
    reads.rows.length = 0;
  }

  function expectRootChange(
    previous: FormValues<RootControls, never>,
    current: FormValues<RootControls, never>,
    rawDataChanged = true,
  ): ValueChanges<RootControls, never> {
    const expected: ValueChanges<RootControls, never> = {
      uiChange: true,
      dataChanged: true,
      rawDataChanged,
      firstUiChange: false,
      previous,
      current,
    };
    expect(fixture.componentInstance.events).toEqual([expected]);
    const rootRead = reads.root.at(-1);
    expect(rootRead?.form).toBe(form);
    expect(rootRead?.fresh).toEqual({...expected, beforeUserChange: initial});
    expect(rootRead?.cached).toEqual(rootRead?.fresh);
    return expected;
  }

  function expectRowChange(
    group: Row,
    previous: PreviousRowValues,
    current: FormValues<RowControls, never>,
    beforeUserChange: FormValues<RowControls, never> | undefined,
    rootChange: ValueChanges<RootControls, never>,
  ): void {
    const read = reads.rows.filter(candidate => candidate.form === group).at(-1);
    expect(read).toBeDefined();
    const expected = {...rootChange, previous, current, beforeUserChange};
    expect(read?.fresh).toEqual(expected);
    expect(read?.cached).toEqual(expected);
    expect(group.getRawValue()).toEqual(current.rawValue);
  }

  function expectNewRowValues(group: Row, name: string, rootChange: ValueChanges<RootControls, never>): void {
    const expected = {
      ...rootChange,
      previous: {value: {}, rawValue: {}},
      current: rowValues(name),
      beforeUserChange: undefined,
    };
    // The new row subscribes after the array emission; onInit has already cached its getter.
    expect(getFormValueChanges<RowControls, never>(group)).toEqual(expected);
    expect(reads.cachedRows.get(group)?.()).toEqual(expected);
    expect(getFormInitialValue<RowControls, never>(group)).toEqual({});
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({imports: [RootLogicHost], providers: [LogicReads]});
    fixture = TestBed.createComponent(RootLogicHost);
    reads = TestBed.inject(LogicReads);
    fixture.detectChanges();
    form = fixture.debugElement.query(By.directive(FormDirective)).injector.get(FormDirective<RootControls, never, never>).form;
    rows = form.controls.rows;
    target = rows.at(1);

    markAsUiChange(target);
    target.controls.name.setValue('B1');
    await settle();

    expect(fixture.componentInstance.events).toEqual([{
      uiChange: true,
      dataChanged: true,
      rawDataChanged: true,
      firstUiChange: true,
      previous: initial,
      current: beforeOperation,
    }]);
    clearReads();
  });

  it('reads the root form and the individual row from their respective service hooks', async () => {
    markAsUiChange(target);
    target.controls.name.setValue('B2');
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['A0', 'B2', 'C0']));
    expectRowChange(target, rowValues('B1'), rowValues('B2'), rowValues('B0'), event);
  });

  it('keeps existing rows stable when appending a row', async () => {
    markAsUiChange(rows);
    rows.push(createRow('D0'));
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['A0', 'B1', 'C0', 'D0']));
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), event);
  });

  it('assigns empty previous values and no original baseline to a newly appended row', async () => {
    const added = createRow('D0');
    markAsUiChange(rows);
    rows.push(added);
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['A0', 'B1', 'C0', 'D0']));
    expectNewRowValues(added, 'D0', event);
  });

  it('keeps row identity and original initial values after removing an earlier row', async () => {
    const removed = rows.at(0);
    const removedChanges = reads.cachedRows.get(removed)!;
    markAsUiChange(rows);
    rows.removeAt(0);
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['B1', 'C0']));
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), event);
    expect(getFormInitialValue<RowControls, never>(target)).toEqual({name: 'B0'});
    expect(removedChanges()).toBeUndefined();
    expect(getFormValueChanges<RowControls, never>(removed)).toBeUndefined();
  });

  it('keeps both existing and new row histories correct when inserting before an existing row', async () => {
    const inserted = createRow('D0');
    markAsUiChange(rows);
    rows.insert(0, inserted);
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['D0', 'A0', 'B1', 'C0']));
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), event);
    expectNewRowValues(inserted, 'D0', event);
    expect(getFormInitialValue<RowControls, never>(target)).toEqual({name: 'B0'});
  });

  it('retains previous values and the original baseline during a batched reorder', async () => {
    markAsUiChange(rows);
    rows.removeAt(1, {emitEvent: false});
    rows.insert(0, target, {emitEvent: false});
    rows.updateValueAndValidity();
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['B1', 'A0', 'C0']));
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), event);
    expect(getFormInitialValue<RowControls, never>(target)).toEqual({name: 'B0'});
  });

  it('keeps cached row getters working when moving the same group between arrays of one root', async () => {
    const cachedBeforeMove = reads.cachedRows.get(target)!;
    markAsUiChange(rows);
    rows.removeAt(1, {emitEvent: false});
    form.controls.parked.push(target, {emitEvent: false});
    form.updateValueAndValidity();
    await settle();

    const event = expectRootChange(beforeOperation, rootValues(['A0', 'C0'], ['B1']));
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), event);
    expect(reads.cachedRows.get(target)).toBe(cachedBeforeMove);
    expect(getFormInitialValue<RowControls, never>(target)).toEqual({name: 'B0'});
  });

  it('keeps value and rawValue aligned when an earlier sibling is disabled and enabled through context helpers', async () => {
    const first = rows.at(0);
    disableControl('test', first, {markAsUiChange: true});
    await settle();

    const disabledValues = rootValues(['A0', 'B1', 'C0'], [], ['B1', 'C0']);
    const disabledEvent = expectRootChange(beforeOperation, disabledValues, false);
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), disabledEvent);

    clearReads();
    enableControl('test', first, {markAsUiChange: true});
    await settle();

    const enabledEvent = expectRootChange(disabledValues, beforeOperation, false);
    expectRowChange(target, rowValues('B1'), rowValues('B1'), rowValues('B0'), enabledEvent);
  });

  it('uses the row original baseline during a later edit after removing an earlier row', async () => {
    markAsUiChange(rows);
    rows.removeAt(0);
    await settle();
    clearReads();

    markAsUiChange(target);
    target.controls.name.setValue('B2');
    await settle();

    const event = expectRootChange(rootValues(['B1', 'C0']), rootValues(['B2', 'C0']));
    expectRowChange(target, rowValues('B1'), rowValues('B2'), rowValues('B0'), event);
  });

  it('uses a new row previous value on later edits while keeping its original baseline absent', async () => {
    const added = createRow('D0');
    markAsUiChange(rows);
    rows.push(added);
    await settle();
    clearReads();

    markAsUiChange(added);
    added.controls.name.setValue('D1');
    await settle();

    const event = expectRootChange(
      rootValues(['A0', 'B1', 'C0', 'D0']),
      rootValues(['A0', 'B1', 'C0', 'D1']),
    );
    expectRowChange(added, rowValues('D0'), rowValues('D1'), undefined, event);
    expect(getFormInitialValue<RowControls, never>(added)).toEqual({});
  });
});
