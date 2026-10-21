import {Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormControl, FormGroup} from '@angular/forms';
import {EMPTY} from 'rxjs';
import {getFormModified, getFormModified$} from '../formModified';
import {FormService, STORAGE} from '../services/form.service';
import {markAsUiChange} from './form-field.directive';
import {FormModifiedDirective, FormValueModified} from './form-modified.directive';
import {FormDirective} from './form.directive';

type ChildControls = {name: FormControl<string>};

@Component({
  standalone: true,
  imports: [FormDirective, FormModifiedDirective],
  template: `
    <div vForm vFormModified [saveDataWithService]="false"
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
  public readonly rootStates: FormValueModified[] = [];
  public readonly nestedStates: FormValueModified[] = [];
}

describe('FormModifiedDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let child: FormGroup<ChildControls>;
  let form: FormGroup<{child: FormGroup<ChildControls>; other: FormControl<string>}>;
  let storage: jasmine.SpyObj<Storage>;

  beforeEach(() => {
    child = new FormGroup({name: new FormControl('initial', {nonNullable: true})});
    form = new FormGroup({child, other: new FormControl('unchanged', {nonNullable: true})});
    const storedValues = new Map<string, string>();
    storage = jasmine.createSpyObj<Storage>('storage', ['getItem', 'setItem']);
    storage.getItem.and.callFake(key => storedValues.get(key) ?? null);
    storage.setItem.and.callFake((key, value) => {
      storedValues.set(key, value);
    });

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

  function render(showNested = true): void {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.child = child;
    fixture.componentInstance.showNested = showNested;
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
    const nestedModified = getFormModified$(child);

    editName('edited');
    TestBed.flushEffects();

    const nestedState: FormValueModified = {
      modified: true,
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'edited'}]
    };
    const rootState: FormValueModified = {
      modified: true,
      diffs: [{path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'edited'}]
    };
    expect(getFormModified(form)).toEqual(rootState);
    expect(getFormModified(child)).toEqual(nestedState);
    expect(nestedModified()).toEqual(nestedState);
    expect(fixture.componentInstance.rootStates).toEqual([rootState]);
    expect(fixture.componentInstance.nestedStates).toEqual([nestedState]);
  });

  it('retains the first baseline when multiple UI changes precede effect execution', () => {
    render();

    editName('first edit');
    editName('second edit');
    TestBed.flushEffects();

    expect(getFormModified(form)?.diffs).toEqual([
      {path: ['child', 'name'], pathString: 'child.name', previousValue: 'initial', currentValue: 'second edit'}
    ]);
    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'second edit'}
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
      {path: ['name'], pathString: 'name', previousValue: 'loaded', currentValue: 'programmatic update'}
    ]);
  });

  it('clears root and nested modification state after returning to the baseline', () => {
    render();
    editName('edited');
    TestBed.flushEffects();
    expect(getFormModified(child)?.modified).toBeTrue();

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
      diffs: [{path: ['name'], pathString: 'name', previousValue: 'initial', currentValue: 'second edit'}]
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
      {path: ['child', 'name'], pathString: 'child.name', previousValue: 'stored', currentValue: 'edited'}
    ]);
    expect(getFormModified(child)?.diffs).toEqual([
      {path: ['name'], pathString: 'name', previousValue: 'stored', currentValue: 'edited'}
    ]);
    expect(JSON.parse(storage.getItem('div_beforeUserChange')!)).toEqual(storedRoot);
    expect(JSON.parse(storage.getItem('section_0_beforeUserChange')!)).toEqual(storedChild);
  });
});
