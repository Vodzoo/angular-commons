import {Component, Injectable, Signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {Subject} from 'rxjs';
import {disableControl, enableControl} from '../disableWithContext';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  getFormInitialValue,
  getFormValueChanges,
  getFormValueChanges$,
  getRootFormInitialValue,
  getRootFormValueChanges,
  getRootFormValueChanges$
} from '../formValues';
import {getRootBeforeUserChange} from '../formModified';
import {FormService} from '../services/form.service';
import {markAsUiChange} from './form-field.directive';
import {FormDirective, ValueChanges} from './form.directive';

type RowControls = {label: FormControl<string>; amount: FormControl<number>};
type Row = FormGroup<RowControls>;
type RootControls = {
  title: FormControl<string>;
  rows: FormArray<Row>;
  details: FormGroup<{note: FormControl<string>}>;
};
type Root = FormGroup<RootControls>;
type Changes = ValueChanges<RootControls, never>;
type RootChanges = ReturnType<typeof getFormValueChanges<RootControls, never>>;
type RowChanges = ReturnType<typeof getFormValueChanges<RowControls, never>>;

const rowValue = (label: string, amount: number) => ({label, amount});
const a0 = rowValue('A0', 10);
const b0 = rowValue('B0', 20);
const c0 = rowValue('C0', 30);
const d0 = rowValue('D0', 40);
const rootValue = (rows = [a0, b0, c0], title = 'title0') => ({
  title,
  rows,
  details: {note: 'note0'}
});
const both = <T>(value: T) => ({rawValue: value, value});

function createRow(label: string, amount: number): Row {
  return new FormGroup({
    label: new FormControl(label, {nonNullable: true}),
    amount: new FormControl(amount, {nonNullable: true})
  });
}

@Injectable()
class OutputFormService extends FormService<RootControls, never, never> {
  protected override fromGroupConfig(): Root {
    return new FormGroup({
      title: new FormControl('title0', {nonNullable: true}),
      rows: new FormArray([createRow('A0', 10), createRow('B0', 20), createRow('C0', 30)]),
      details: new FormGroup({note: new FormControl('note0', {nonNullable: true})})
    });
  }
}

@Component({
  standalone: true,
  imports: [FormDirective],
  template: `
    <form vForm [saveDataWithService]="false" [clearForm]="clearForm"
          (formCreated)="captureForm($event)" (valueChanged)="captureChange($event)"></form>
  `
})
class OutputHost {
  readonly clearForm = new Subject<undefined>();
  readonly created: Root[] = [];
  readonly emitted: Changes[] = [];
  readonly observedDuringOutput: Array<{emitted: Changes; local: RootChanges; root: Changes | undefined}> = [];
  form!: Root;
  a!: Row;
  b!: Row;
  c!: Row;
  rootChanges!: Signal<RootChanges>;
  rowChanges!: Signal<RowChanges>;
  // Set in the formCreated handler, before the first valueChanges event exists.
  valuesAtCreation: RootChanges;
  rowValuesAtCreation: RowChanges;

  captureForm(form: Root): void {
    this.created.push(form);
    this.form = form;
    [this.a, this.b, this.c] = form.controls.rows.controls;
    this.rootChanges = getFormValueChanges$<RootControls, never>(form);
    this.rowChanges = getFormValueChanges$<RowControls, never>(this.b);
    this.valuesAtCreation = this.rootChanges();
    this.rowValuesAtCreation = this.rowChanges();
  }

  captureChange(emitted: Changes): void {
    this.emitted.push(emitted);
    this.observedDuringOutput.push({
      emitted,
      local: getFormValueChanges<RootControls, never>(this.form),
      root: getRootFormValueChanges<RootControls, never>(this.form)
    });
  }
}

describe('Form value helpers used by consumers of formCreated and valueChanged', () => {
  let fixture: ComponentFixture<OutputHost>;
  let host: OutputHost;
  let rows: FormArray<Row>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OutputHost],
      providers: [OutputFormService, {provide: FormService, useExisting: OutputFormService}]
    });
    fixture = TestBed.createComponent(OutputHost);
    fixture.detectChanges();
    host = fixture.componentInstance;
    rows = host.form.controls.rows;
  });

  function expectRootOutput(expected: Changes, baseline?: ReturnType<typeof both>): void {
    const emitted = host.emitted.at(-1)!;
    const observed = host.observedDuringOutput.at(-1)!;
    expect(emitted).toEqual(expected);
    expect(observed.emitted).toBe(emitted);
    expect(observed.root).toBe(emitted);
    expect(observed.local).toEqual({...expected, beforeUserChange: baseline});
    expect(observed.local!.previous).toBe(emitted.previous);
    expect(observed.local!.current).toBe(emitted.current);
    expect(host.rootChanges()).toEqual({...expected, beforeUserChange: baseline});
    expect(getRootFormValueChanges$(host.b)()).toBe(emitted);
    expect(getFormValueChanges(host.form)).toEqual(host.rootChanges());
  }

  function expectB(expected: unknown): void {
    // Check both a signal retained since formCreated and fresh consumers.
    expect(host.rowChanges()).toEqual(expected);
    expect(getFormValueChanges(host.b)).toEqual(expected);
    expect(getFormValueChanges$(host.b)()).toEqual(expected);
    expect(getFormInitialValue(host.b)).toEqual(b0);
  }

  it('allows getters to be created synchronously in formCreated before the first change', () => {
    expect(host.created).toEqual([host.form]);
    expect(host.created[0]).toBe(host.form);
    expect(host.valuesAtCreation).toBeUndefined();
    expect(host.rowValuesAtCreation).toBeUndefined();
    expect(host.rootChanges()).toBeUndefined();
    expect(host.rowChanges()).toBeUndefined();
    expect(getRootFormValueChanges(host.form)).toBeUndefined();
    expect(getRootBeforeUserChange(host.form)).toBeUndefined();
    expect(getFormInitialValue(host.form)).toEqual(rootValue());
    expect(getFormInitialValue(host.form)).toBe(getRootFormInitialValue(host.b));
    expect(getFormInitialValue(host.b)).toEqual(b0);
    expect(getFormInitialValue(host.form.controls.details)).toEqual({note: 'note0'});
    expect(host.emitted).toEqual([]);
  });

  it('preserves complete root output data, references, flags and the first UI baseline', () => {
    host.form.controls.title.setValue('title1');
    expectRootOutput({
      uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue()), current: both(rootValue([a0, b0, c0], 'title1'))
    });

    const beforeUi = host.emitted[0].current;
    markAsUiChange(host.b);
    host.b.controls.label.setValue('B1');
    expectRootOutput({
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, b0, c0], 'title1')),
      current: both(rootValue([a0, rowValue('B1', 20), c0], 'title1'))
    }, beforeUi);
    expect(host.rootChanges()!.beforeUserChange).toBe(beforeUi);

    markAsUiChange(host.form);
    host.form.controls.title.setValue('title2');
    expectRootOutput({
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, rowValue('B1', 20), c0], 'title1')),
      current: both(rootValue([a0, rowValue('B1', 20), c0], 'title2'))
    }, beforeUi);
    expect(host.rootChanges()!.beforeUserChange).toBe(beforeUi);
    expect(host.emitted).toHaveLength(3);
    expect(beforeUi).toEqual(both(rootValue([a0, b0, c0], 'title1')));
    expect(getFormInitialValue(host.form)).toEqual(rootValue());
  });

  it.each(['append', 'remove', 'insert', 'reorder'] as const)(
    'keeps exact root output data when consumers %s a FormArray row', operation => {
      markAsUiChange(rows);
      let expectedRows: Array<{label: string; amount: number}>;
      switch (operation) {
        case 'append': rows.push(createRow('D0', 40)); expectedRows = [a0, b0, c0, d0]; break;
        case 'remove': rows.removeAt(0); expectedRows = [b0, c0]; break;
        case 'insert': rows.insert(0, createRow('D0', 40)); expectedRows = [d0, a0, b0, c0]; break;
        case 'reorder':
          rows.removeAt(2, {emitEvent: false});
          rows.insert(0, host.c);
          expectedRows = [c0, a0, b0];
          break;
      }
      expectRootOutput({
        uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
        previous: both(rootValue()), current: both(rootValue(expectedRows))
      }, both(rootValue()));
      expect(host.emitted).toHaveLength(1);
      expect(getFormInitialValue(host.form)).toEqual(rootValue());
    }
  );

  it.each(['remove', 'insert', 'reorder'] as const)(
    'keeps early and late row getters attached to B after %s', operation => {
      markAsUiChange(host.b);
      host.b.controls.label.setValue('B1');
      const editedB = rowValue('B1', 20);

      markAsUiChange(rows);
      if (operation === 'remove') rows.removeAt(0);
      if (operation === 'insert') rows.insert(0, createRow('D0', 40));
      if (operation === 'reorder') {
        rows.removeAt(2, {emitEvent: false});
        rows.insert(0, host.c);
      }
      expectB({
        uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
        previous: both(editedB), current: both(editedB), beforeUserChange: both(b0)
      });

      markAsUiChange(host.b);
      host.b.controls.label.setValue('B2');
      expectB({
        uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
        previous: both(editedB), current: both(rowValue('B2', 20)), beforeUserChange: both(b0)
      });
    }
  );

  it('uses raw and enabled row positions separately when an earlier row is disabled', () => {
    disableControl('test', host.a);
    expectRootOutput({
      uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: false,
      previous: both(rootValue()),
      current: {rawValue: rootValue(), value: rootValue([b0, c0])}
    });

    markAsUiChange(host.b);
    host.b.controls.label.setValue('B1');
    expectB({
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
      previous: both(b0), current: both(rowValue('B1', 20)), beforeUserChange: both(b0)
    });
  });

  it('does not assign the next enabled row value to a disabled target row', () => {
    markAsUiChange(host.b);
    disableControl('test', host.b);
    expectB({
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: false,
      previous: both(b0), current: {rawValue: b0, value: {}}, beforeUserChange: both(b0)
    });

    enableControl('test', host.b);
    expectB({
      uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: false,
      previous: {rawValue: b0, value: {}}, current: both(b0), beforeUserChange: both(b0)
    });
  });

  it.each(['append', 'insert'] as const)(
    'gives a newly added row no previous, baseline or initial data from its neighbours (%s)', operation => {
      const added = createRow('D0', 40);
      markAsUiChange(rows);
      if (operation === 'append') rows.push(added);
      else rows.insert(0, added);

      const changes = getFormValueChanges$(added);
      expect(changes()).toEqual({
        uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
        previous: both({}), current: both(d0), beforeUserChange: undefined
      });
      expect(getFormValueChanges(added)).toEqual(changes());
      expect(getFormInitialValue(added)).toEqual({});
      expect(getFormInitialValue(host.b)).toEqual(b0);

      markAsUiChange(added);
      added.controls.label.setValue('D1');
      expect(changes()).toEqual({
        uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
        previous: both(d0), current: both(rowValue('D1', 40)), beforeUserChange: undefined
      });
    }
  );

  it('includes a programmatically added row in the first UI baseline without inventing its initial value', () => {
    const added = createRow('D0', 40);
    rows.push(added);
    const observed = getFormValueChanges$(added);
    expectRootOutput({
      uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue()), current: both(rootValue([a0, b0, c0, d0]))
    });
    expect(observed()).toEqual({
      uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both({}), current: both(d0), beforeUserChange: undefined
    });
    expect(getFormInitialValue(added)).toEqual({});

    const beforeUi = host.emitted[0].current;
    markAsUiChange(added);
    added.controls.label.setValue('D1');
    const event: Changes = {
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, b0, c0, d0])),
      current: both(rootValue([a0, b0, c0, rowValue('D1', 40)]))
    };
    expectRootOutput(event, beforeUi);
    const expected = {
      ...event, previous: both(d0), current: both(rowValue('D1', 40)), beforeUserChange: both(d0)
    };
    expect(observed()).toEqual(expected);
    expect(getFormValueChanges(added)).toEqual(expected);
    expect(host.rootChanges()!.beforeUserChange).toBe(beforeUi);
    expect(observed()!.beforeUserChange!.rawValue).toBe(beforeUi.rawValue.rows[3]);
    expect(getFormInitialValue(added)).toEqual({});
    expect(host.emitted).toHaveLength(2);
  });

  it('keeps different groups with identical empty and zero values attached to their own history', () => {
    const payload = rowValue('', 0);
    host.a.setValue(payload);
    const baseline = host.emitted[0].current;
    const existingChanges = getFormValueChanges$(host.a);
    const added = createRow('', 0);

    markAsUiChange(rows);
    rows.insert(0, added);
    const addedChanges = getFormValueChanges$(added);
    const inserted: Changes = {
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([payload, b0, c0])),
      current: both(rootValue([payload, payload, b0, c0]))
    };
    expectRootOutput(inserted, baseline);
    expect(existingChanges()).toEqual({
      ...inserted, previous: both(payload), current: both(payload), beforeUserChange: both(payload)
    });
    expect(addedChanges()).toEqual({
      ...inserted, previous: both({}), current: both(payload), beforeUserChange: undefined
    });
    expect(getFormInitialValue(host.a)).toEqual(a0);
    expect(getFormInitialValue(added)).toEqual({});
    expect(existingChanges()!.current.rawValue).toBe(host.emitted[1].current.rawValue.rows[1]);
    expect(addedChanges()!.current.rawValue).toBe(host.emitted[1].current.rawValue.rows[0]);

    markAsUiChange(added);
    added.controls.label.setValue('added only');
    const edited: Changes = {
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([payload, payload, b0, c0])),
      current: both(rootValue([rowValue('added only', 0), payload, b0, c0]))
    };
    expectRootOutput(edited, baseline);
    const expectedExisting = {
      ...edited, previous: both(payload), current: both(payload), beforeUserChange: both(payload)
    };
    const expectedAdded = {
      ...edited, previous: both(payload), current: both(rowValue('added only', 0)), beforeUserChange: undefined
    };
    expect(existingChanges()).toEqual(expectedExisting);
    expect(getFormValueChanges(host.a)).toEqual(expectedExisting);
    expect(addedChanges()).toEqual(expectedAdded);
    expect(getFormValueChanges(added)).toEqual(expectedAdded);
    expect(host.a.getRawValue()).toStrictEqual(payload);
    expect(getFormInitialValue(host.a)).toEqual(a0);
    expect(getFormInitialValue(added)).toEqual({});
    expect(host.emitted).toHaveLength(3);
  });

  it('returns no changes for an emitted form row after that row is removed', () => {
    markAsUiChange(rows);
    rows.removeAt(1);

    expect(host.rowChanges()).toBeUndefined();
    expect(getFormValueChanges(host.b)).toBeUndefined();
    expect(getFormValueChanges$(host.b)()).toBeUndefined();
    expect(getFormInitialValue(host.b)).toEqual(b0);
    expect(getRootFormValueChanges(host.b)).toBe(host.emitted[0]);
  });

  it('restores the same row identity and initial baseline when a removed group is added again', () => {
    markAsUiChange(rows);
    rows.removeAt(1);
    markAsUiChange(rows);
    rows.push(host.b);

    expectB({
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both({}), current: both(b0), beforeUserChange: both(b0)
    });
    expectRootOutput({
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, c0])), current: both(rootValue([a0, c0, b0]))
    }, both(rootValue()));
  });

  it('preserves output data and row history through clearForm resetting initial values', () => {
    markAsUiChange(host.b);
    host.b.controls.label.setValue('B1');
    const originalBaseline = host.rootChanges()!.beforeUserChange;
    host.clearForm.next(undefined);

    expectRootOutput({
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, rowValue('B1', 20), c0])), current: both(rootValue())
    }, both(rootValue()));
    expect(host.rootChanges()!.beforeUserChange).toBe(originalBaseline);
    expectB({
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rowValue('B1', 20)), current: both(b0), beforeUserChange: both(b0)
    });
    expect(host.created).toHaveLength(1);
    expect(getFormInitialValue(host.form)).toEqual(rootValue());
  });

  it('does not publish unchanged values or consume the first UI baseline', () => {
    markAsUiChange(host.b);
    host.b.controls.label.setValue('B0');
    expect(host.emitted).toEqual([]);
    expect(host.rootChanges()).toBeUndefined();
    expect(getRootBeforeUserChange(host.form)).toBeUndefined();

    markAsUiChange(host.b);
    host.b.controls.label.setValue('B1');
    expectRootOutput({
      uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue()), current: both(rootValue([a0, rowValue('B1', 20), c0]))
    }, both(rootValue()));
  });

  it('preserves data-change filtering for equal-value replacements and records their identity for the next edit', () => {
    markAsUiChange(host.b);
    host.b.controls.label.setValue('B1');
    const published = getRootFormValueChanges(host.form);
    const replacement = createRow('B1', 20);
    rows.setControl(1, replacement);

    expect(host.emitted).toHaveLength(1);
    expect(getRootFormValueChanges(host.form)).toBe(published);
    const replacementChanges = getFormValueChanges$(replacement);
    // Getters describe the last published data change, where this group was absent.
    expect(replacementChanges()).toBeUndefined();
    expect(getFormInitialValue(replacement)).toEqual({});

    markAsUiChange(replacement);
    replacement.controls.label.setValue('B2');
    const event: Changes = {
      uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
      previous: both(rootValue([a0, rowValue('B1', 20), c0])),
      current: both(rootValue([a0, rowValue('B2', 20), c0]))
    };
    expectRootOutput(event, both(rootValue()));
    expect(replacementChanges()).toEqual({
      ...event,
      previous: both(rowValue('B1', 20)),
      current: both(rowValue('B2', 20)),
      beforeUserChange: undefined
    });
    expect(getFormValueChanges(replacement)).toEqual(replacementChanges());
    expect(host.rowChanges()).toBeUndefined();
    expect(host.emitted).toHaveLength(2);
  });
});
