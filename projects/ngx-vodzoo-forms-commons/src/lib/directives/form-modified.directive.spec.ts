import {Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {EMPTY} from 'rxjs';
import {vi, type Mock} from 'vitest';
import {getFormModified, getFormModified$} from '../formModified';
import {disableControl, enableControl} from '../disableWithContext';
import {FormService, STORAGE} from '../services/form.service';
import {markAsUiChange} from './form-field.directive';
import {
  FORM_MODIFIED_CONFIG,
  FormModifiedDiffEntry,
  FormModifiedDirective,
  FormModifiedEqualFn,
  FormValueModified,
  ValueSelectorFn
} from './form-modified.directive';
import {FormDirective} from './form.directive';

type ChildControls = {name: FormControl<string>};

@Component({
  standalone: true,
  imports: [FormDirective, FormModifiedDirective],
  template: `
    <div vForm vFormModified [saveDataWithService]="false"
         [formModifiedEqualFn]="equalFn" [formModifiedValueSelectorFn]="valueSelectorFn"
         (formValueModified)="rootStates.push($event)">
      @if (showNested) {
        <section vForm vFormModified [form]="child" [formIndex]="0"
                 (formValueModified)="nestedStates.push($event)"></section>
      }
    </div>
  `
})
class TestHostComponent {
  public child!: FormGroup<ChildControls>;
  public showNested = true;
  public equalFn?: FormModifiedEqualFn;
  public valueSelectorFn?: ValueSelectorFn;
  public readonly rootStates: FormValueModified[] = [];
  public readonly nestedStates: FormValueModified[] = [];
}

describe('FormModifiedDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let child: FormGroup<ChildControls>;
  let form: FormGroup<{child: FormGroup<ChildControls>; other: FormControl<string>}>;
  let storage: {getItem: Mock<Storage['getItem']>; setItem: Mock<Storage['setItem']>};

  beforeEach(() => {
    child = new FormGroup({name: new FormControl('initial', {nonNullable: true})});
    form = new FormGroup({child, other: new FormControl('unchanged', {nonNullable: true})});
    const storedValues = new Map<string, string>();
    storage = {
      getItem: vi.fn<Storage['getItem']>(key => storedValues.get(key) ?? null),
      setItem: vi.fn<Storage['setItem']>((key, value) => {
        storedValues.set(key, value);
      }),
    };

    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        {provide: STORAGE, useValue: storage},
        {
          provide: FormService,
          useValue: {
            initialValue: form.getRawValue(),
            getFormGroup: () => form,
            patchFormValueChanges: EMPTY,
          }
        }
      ]
    });
  });

  function render(showNested = true, options: {
    equalFn?: FormModifiedEqualFn;
    valueSelectorFn?: ValueSelectorFn;
  } = {}): void {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.child = child;
    fixture.componentInstance.showNested = showNested;
    fixture.componentInstance.equalFn = options.equalFn;
    fixture.componentInstance.valueSelectorFn = options.valueSelectorFn;
    fixture.detectChanges();
    TestBed.flushEffects();
  }

  function editName(value: string): void {
    markAsUiChange(child.controls.name);
    child.controls.name.setValue(value);
  }

  it('waits for the first UI change before setting root and nested modification state', () => {
    render();

    child.controls.name.setValue('loaded');
    TestBed.flushEffects();

    expect(getFormModified(form)).toBeUndefined();
    expect(getFormModified(child)).toBeUndefined();
    expect(fixture.componentInstance.rootStates).toEqual([]);
    expect(fixture.componentInstance.nestedStates).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('sets root and nested state with paths relative to each form', () => {
    render();
    const rootModified = getFormModified$(form);
    const nestedModified = getFormModified$(child);

    editName('edited');
    TestBed.flushEffects();

    const nestedState: FormValueModified = {
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'edited', disabled: false}]
    };
    const rootState: FormValueModified = {
      modified: true,
      diffs: [{path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'edited', disabled: false}]
    };
    expect(getFormModified(form)).toEqual(rootState);
    expect(rootModified()).toEqual(rootState);
    expect(getFormModified(child)).toEqual(nestedState);
    expect(nestedModified()).toEqual(nestedState);
    expect(fixture.componentInstance.rootStates).toEqual([rootState]);
    expect(fixture.componentInstance.nestedStates).toEqual([nestedState]);
  });

  it('includes the current disabled state in root and nested diffs when values are compared', () => {
    render();
    editName('edited');
    TestBed.flushEffects();

    disableControl('hidden', child.controls.name, {emitEvent: false});
    child.controls.name.setValue('hidden edit');
    TestBed.flushEffects();

    const disabledState = getFormModified(child);
    expect(disabledState).toEqual({
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'hidden edit', disabled: true}],
    });
    expect(getFormModified(form)?.diffs).toEqual([
      {path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'hidden edit', disabled: true},
    ]);

    enableControl('hidden', child.controls.name, {emitEvent: false});
    child.controls.name.setValue('enabled edit');
    TestBed.flushEffects();

    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'enabled edit', disabled: false},
    ]);
    expect(getFormModified(form)?.diffs[0]?.disabled).toBe(false);
    expect(disabledState?.diffs[0]?.disabled).toBe(true);
    expect(fixture.componentInstance.nestedStates.at(-1)).toEqual(getFormModified(child));
    expect(fixture.componentInstance.rootStates.at(-1)).toEqual(getFormModified(form));
  });

  it('updates disabled metadata when controls are toggled without changing raw values', () => {
    render();
    editName('edited');
    TestBed.flushEffects();
    const rawValue = form.getRawValue();
    const nestedModified = getFormModified$(child);
    const enabledState = getFormModified(form);
    expect(enabledState?.diffs[0]?.disabled).toBe(false);

    disableControl('hidden', child.controls.name);
    TestBed.flushEffects();

    const disabledState = getFormModified(form);
    expect(form.getRawValue()).toEqual(rawValue);
    expect(form.value).toEqual({other: 'unchanged'});
    expect(disabledState).toEqual({
      modified: true,
      diffs: [{path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'edited', disabled: true}],
    });
    expect(nestedModified()).toEqual({
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'edited', disabled: true}],
    });
    expect(fixture.componentInstance.rootStates.at(-1)).toEqual(disabledState);
    expect(fixture.componentInstance.nestedStates.at(-1)).toEqual(nestedModified());
    expect(enabledState?.diffs[0]?.disabled).toBe(false);

    enableControl('hidden', child.controls.name);
    TestBed.flushEffects();

    expect(form.getRawValue()).toEqual(rawValue);
    expect(form.value).toEqual(rawValue);
    expect(getFormModified(form)).toEqual(enabledState);
    expect(nestedModified()).toEqual({
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'edited', disabled: false}],
    });
    expect(getFormModified(child)).toEqual(nestedModified());
    expect(fixture.componentInstance.rootStates.at(-1)).toEqual(enabledState);
    expect(fixture.componentInstance.nestedStates.at(-1)).toEqual(nestedModified());
    expect(disabledState?.diffs[0]?.disabled).toBe(true);
  });

  it('retains the first baseline when multiple UI changes precede effect execution', () => {
    render();

    editName('first edit');
    editName('second edit');
    TestBed.flushEffects();

    expect(getFormModified(form)?.diffs).toEqual([
      {path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'second edit', disabled: false}
    ]);
    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'second edit', disabled: false}
    ]);
  });

  it('uses the value before the first UI change and keeps it for later programmatic changes', () => {
    render();
    child.controls.name.setValue('loaded');
    TestBed.flushEffects();

    editName('edited');
    TestBed.flushEffects();
    expect(getFormModified(child)?.diffs[0]?.previousValue).toBe('loaded');

    child.controls.name.setValue('programmatic update');
    TestBed.flushEffects();

    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'loaded', currentValue: 'programmatic update', disabled: false}
    ]);
  });

  it('clears root and nested modification state after returning to the baseline', () => {
    render();
    editName('edited');
    TestBed.flushEffects();
    expect(getFormModified(child)?.modified).toBe(true);

    editName('initial');
    TestBed.flushEffects();

    const unmodified: FormValueModified = {modified: false, diffs: []};
    expect(getFormModified(form)).toEqual(unmodified);
    expect(getFormModified(child)).toEqual(unmodified);
    expect(fixture.componentInstance.rootStates.slice(-1)).toEqual([unmodified]);
    expect(fixture.componentInstance.nestedStates.slice(-1)).toEqual([unmodified]);
  });

  it('uses the saved root baseline when the nested directive is created after UI changes', () => {
    render(false);
    editName('first edit');
    editName('second edit');
    TestBed.flushEffects();
    expect(getFormModified(child)).toBeUndefined();

    fixture.componentInstance.showNested = true;
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(getFormModified(child)).toEqual({
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'second edit', disabled: false}]
    });
  });

  it('prefers stored baselines over the first UI baseline for root and nested forms', () => {
    const storedRoot = {child: {name: 'stored'}, other: 'unchanged'};
    const storedChild = {name: 'stored'};
    storage.setItem('div_beforeUserChange', JSON.stringify(storedRoot));
    storage.setItem('section_0_beforeUserChange', JSON.stringify(storedChild));
    render();

    editName('edited');
    TestBed.flushEffects();

    expect(getFormModified(form)?.diffs).toEqual([
      {path: ['child', 'name'], pathString: 'child.name', previousValue: 'stored', currentValue: 'edited', disabled: false}
    ]);
    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'stored', currentValue: 'edited', disabled: false}
    ]);
    expect(JSON.parse(storage.getItem('div_beforeUserChange')!)).toEqual(storedRoot);
    expect(JSON.parse(storage.getItem('section_0_beforeUserChange')!)).toEqual(storedChild);
  });

  it('uses a custom equality function without changing the raw values in emitted diffs', () => {
    const equalFn: FormModifiedEqualFn = (previous, current) => {
      if (typeof previous === 'string' && typeof current === 'string') {
        return previous.trim() === current.trim();
      }
      return JSON.stringify(previous) === JSON.stringify(current);
    };
    render(false, {equalFn});

    editName(' initial ');
    TestBed.flushEffects();
    editName(' edited ');
    TestBed.flushEffects();

    const modified: FormValueModified = {
      modified: true,
      diffs: [change(['child', 'name'], 'initial', ' edited ', false)]
    };
    expect(fixture.componentInstance.rootStates).toEqual([unmodified, modified]);
    expect(getFormModified(form)).toEqual(modified);
    expect(getFormModified$(form)()).toEqual(modified);
  });

  it('compares selected values but emits the original values and paths', () => {
    const valueSelectorFn: ValueSelectorFn = (value, path) => {
      return path.join('.') === 'child.name' && typeof value === 'string'
        ? value.trim().toLowerCase()
        : value;
    };
    render(false, {valueSelectorFn});

    editName(' INITIAL ');
    TestBed.flushEffects();
    editName(' EDITED ');
    TestBed.flushEffects();

    const modified: FormValueModified = {
      modified: true,
      diffs: [change(['child', 'name'], 'initial', ' EDITED ', false)]
    };
    expect(fixture.componentInstance.rootStates).toEqual([unmodified, modified]);
    expect(getFormModified(form)).toEqual(modified);
    expect(getFormModified$(form)()).toEqual(modified);
  });

  it('uses equality and value selection from the configured defaults', () => {
    TestBed.overrideProvider(FORM_MODIFIED_CONFIG, {
      useValue: {
        equalFn: (previous: unknown, current: unknown) => {
          if (typeof previous === 'string' && typeof current === 'string') {
            return previous.trim() === current.trim();
          }
          return JSON.stringify(previous) === JSON.stringify(current);
        },
        valueSelectorFn: (value: unknown) => typeof value === 'string' ? value.toLowerCase() : value,
      }
    });
    render(false);

    editName('INITIAL ');
    TestBed.flushEffects();

    expect(fixture.componentInstance.rootStates).toEqual([unmodified]);
    expect(getFormModified(form)).toEqual(unmodified);
    expect(getFormModified$(form)()).toEqual(unmodified);
  });

  it('prefers equality and selector inputs over the configured defaults', () => {
    TestBed.overrideProvider(FORM_MODIFIED_CONFIG, {
      useValue: {equalFn: () => true, valueSelectorFn: () => null}
    });
    render(false, {
      equalFn: (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
      valueSelectorFn: value => value,
    });

    editName('edited');
    TestBed.flushEffects();

    const modified: FormValueModified = {
      modified: true,
      diffs: [change(['child', 'name'], 'initial', 'edited', false)]
    };
    expect(fixture.componentInstance.rootStates).toEqual([modified]);
    expect(getFormModified(form)).toEqual(modified);
    expect(getFormModified$(form)()).toEqual(modified);
  });
});

@Component({
  standalone: true,
  imports: [FormDirective, FormModifiedDirective],
  template: `
    <form vForm vFormModified [saveDataWithService]="false"
          (formValueModified)="states.push($event)"></form>
  `
})
class ArrayTestHostComponent {
  public readonly states: FormValueModified[] = [];
}

const unmodified: FormValueModified = {modified: false, diffs: []};

function change(path: (string | number)[], previousValue: unknown, currentValue: unknown, disabled: boolean | undefined): FormModifiedDiffEntry {
  return {path, pathString: path.join('.'), previousValue, currentValue, disabled};
}

describe('FormModifiedDirective root output with dynamic FormArray', () => {
  let fixture: ComponentFixture<ArrayTestHostComponent>;
  let first: FormGroup<ChildControls>;
  let second: FormGroup<ChildControls>;
  let third: FormGroup<ChildControls>;
  let rows: FormArray<FormGroup<ChildControls>>;
  let form: FormGroup<{rows: FormArray<FormGroup<ChildControls>>}>;
  let modified: ReturnType<typeof getFormModified$>;
  let storage: {getItem: Mock<Storage['getItem']>; setItem: Mock<Storage['setItem']>};

  const initial = {rows: [{name: 'A'}, {name: 'B'}, {name: 'C'}]};
  const removedFirst: FormValueModified = {
    modified: true,
    diffs: [
      change(['rows', 0, 'name'], 'A', 'B', false),
      change(['rows', 1, 'name'], 'B', 'C', false),
      change(['rows', 2], {name: 'C'}, undefined, undefined),
    ]
  };
  const reordered: FormValueModified = {
    modified: true,
    diffs: [
      change(['rows', 0, 'name'], 'A', 'B', false),
      change(['rows', 1, 'name'], 'B', 'C', false),
      change(['rows', 2, 'name'], 'C', 'A', false),
    ]
  };

  function row(name: string): FormGroup<ChildControls> {
    return new FormGroup({name: new FormControl(name, {nonNullable: true})});
  }

  beforeEach(() => {
    first = row('A');
    second = row('B');
    third = row('C');
    rows = new FormArray([first, second, third]);
    form = new FormGroup({rows});
    const storedValues = new Map<string, string>();
    storage = {
      getItem: vi.fn<Storage['getItem']>(key => storedValues.get(key) ?? null),
      setItem: vi.fn<Storage['setItem']>((key, value) => {
        storedValues.set(key, value);
      }),
    };
    TestBed.configureTestingModule({
      imports: [ArrayTestHostComponent],
      providers: [
        {provide: STORAGE, useValue: storage},
        {provide: FormService, useValue: {
          initialValue: form.getRawValue(),
          getFormGroup: () => form,
          patchFormValueChanges: EMPTY,
        }},
      ]
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(ArrayTestHostComponent);
    fixture.detectChanges();
    TestBed.flushEffects();
    modified = getFormModified$(form);
  }

  function edit(operation: () => void): void {
    markAsUiChange(rows);
    operation();
    TestBed.flushEffects();
  }

  function expectStates(...states: FormValueModified[]): void {
    expect(fixture.componentInstance.states).toEqual(states);
    expect(getFormModified(form)).toEqual(states.at(-1));
    expect(modified()).toEqual(states.at(-1));
  }

  it('waits for a UI change and captures the loaded array values as its baseline', () => {
    render();
    first.controls.name.setValue('loaded A');
    TestBed.flushEffects();
    expectStates();
    expect(storage.setItem).not.toHaveBeenCalled();

    edit(() => first.controls.name.setValue('edited A'));

    expectStates({modified: true, diffs: [change(['rows', 0, 'name'], 'loaded A', 'edited A', false)]});
    expect(JSON.parse(storage.getItem('form_beforeUserChange')!)).toEqual({
      rows: [{name: 'loaded A'}, {name: 'B'}, {name: 'C'}]
    });
  });

  it('emits the added row and clears all three public states when it is removed', () => {
    render();
    const added: FormValueModified = {
      modified: true,
      diffs: [change(['rows', 3], undefined, {name: 'D'}, false)]
    };
    edit(() => rows.push(row('D')));
    expectStates(added);

    edit(() => rows.removeAt(3));
    expectStates(added, unmodified);
    expect(JSON.parse(storage.getItem('form_beforeUserChange')!)).toEqual(initial);
  });

  it('keeps root diffs positional when a preceding row is removed and restored', () => {
    render();
    edit(() => rows.removeAt(0));
    expectStates(removedFirst);

    edit(() => rows.insert(0, first));
    expectStates(removedFirst, unmodified);
    expect(JSON.parse(storage.getItem('form_beforeUserChange')!)).toEqual(initial);
  });

  it('emits every shifted position after insert and clears after restoring the original rows', () => {
    render();
    const inserted: FormValueModified = {
      modified: true,
      diffs: [
        change(['rows', 1, 'name'], 'B', 'X', false),
        change(['rows', 2, 'name'], 'C', 'B', false),
        change(['rows', 3], undefined, {name: 'C'}, false),
      ]
    };
    edit(() => rows.insert(1, row('X')));
    expectStates(inserted);

    edit(() => rows.removeAt(1));
    expectStates(inserted, unmodified);
  });

  it('keeps the original baseline when remove and insert run before effects', () => {
    render();
    edit(() => {
      rows.removeAt(0);
      rows.insert(2, first);
    });
    expectStates(reordered);

    edit(() => {
      rows.removeAt(2);
      rows.insert(0, first);
    });
    expectStates(reordered, unmodified);
  });

  it('handles reorder with a silent removal and one final emitted change', () => {
    render();
    edit(() => {
      rows.removeAt(0, {emitEvent: false});
      rows.insert(2, first);
    });
    expectStates(reordered);

    edit(() => {
      rows.removeAt(2, {emitEvent: false});
      rows.insert(0, first);
    });
    expectStates(reordered, unmodified);
  });

  it('emits the intermediate and final positional diffs for separately observed reorder steps', () => {
    render();
    edit(() => rows.removeAt(0));
    expectStates(removedFirst);
    edit(() => rows.insert(2, first));
    expectStates(removedFirst, reordered);

    edit(() => rows.removeAt(2));
    expectStates(removedFirst, reordered, removedFirst);
    edit(() => rows.insert(0, first));
    expectStates(removedFirst, reordered, removedFirst, unmodified);
  });

  it('reports a batch of silent structural edits against the original baseline', () => {
    render();
    const changed: FormValueModified = {
      modified: true,
      diffs: [
        change(['rows', 0, 'name'], 'A', 'B', false),
        change(['rows', 1, 'name'], 'B', 'X', false),
        change(['rows', 3], undefined, {name: 'D'}, false),
      ]
    };
    edit(() => {
      rows.removeAt(0, {emitEvent: false});
      rows.insert(1, row('X'), {emitEvent: false});
      rows.push(row('D'), {emitEvent: false});
      form.updateValueAndValidity();
    });
    expectStates(changed);

    edit(() => {
      rows.clear({emitEvent: false});
      for (const original of [first, second, third]) {
        rows.push(original, {emitEvent: false});
      }
      form.updateValueAndValidity();
    });
    expectStates(changed, unmodified);
  });

  it('uses raw array positions when an earlier row is disabled', () => {
    render();
    disableControl('test', first);
    TestBed.flushEffects();
    expectStates();

    const changed: FormValueModified = {
      modified: true,
      diffs: [change(['rows', 1, 'name'], 'B', 'edited B', false)]
    };
    edit(() => second.controls.name.setValue('edited B'));
    expectStates(changed);
    expect(JSON.parse(storage.getItem('form_beforeUserChange')!)).toEqual(initial);

    edit(() => second.controls.name.setValue('B'));
    expectStates(changed, unmodified);
  });

  it('keeps a stored array baseline across structural edits and clears when that baseline is restored', () => {
    const stored = {rows: [{name: 'saved A'}, {name: 'saved B'}, {name: 'saved C'}]};
    storage.setItem('form_beforeUserChange', JSON.stringify(stored));
    render();
    const changed: FormValueModified = {
      modified: true,
      diffs: [
        change(['rows', 0, 'name'], 'saved A', 'B', false),
        change(['rows', 1, 'name'], 'saved B', 'C', false),
        change(['rows', 2], {name: 'saved C'}, undefined, undefined),
      ]
    };
    edit(() => rows.removeAt(0));
    expectStates(changed);

    edit(() => {
      rows.insert(0, first, {emitEvent: false});
      form.setValue(stored);
    });
    expectStates(changed, unmodified);
    expect(JSON.parse(storage.getItem('form_beforeUserChange')!)).toEqual(stored);
  });
});
