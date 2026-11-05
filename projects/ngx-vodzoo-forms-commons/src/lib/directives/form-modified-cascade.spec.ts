import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TestBed} from '@angular/core/testing';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {EMPTY} from 'rxjs';
import {disableControl, enableControl} from '../disableWithContext';
import {getFormModified, getFormModified$} from '../formModified';
import {FormService, STORAGE} from '../services/form.service';
import {markAsUiChange} from './form-field.directive';
import {FormModifiedDirective, FormValueModified} from './form-modified.directive';
import {FormDirective} from './form.directive';

type CascadeControls = {a: FormControl<string>; b: FormControl<string>; c: FormControl<string>};

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, FormDirective, FormModifiedDirective],
  template: `
    <div vForm vFormModified [saveDataWithService]="false"
         (formValueModified)="states.push($event)">
      <input data-field="a" [formControl]="form.controls.a">
      <input data-field="b" [formControl]="form.controls.b">
      <select data-field="c" [formControl]="form.controls.c">
        <option value="">Choose</option>
        <option value="selected">Selected</option>
      </select>
    </div>
  `,
})
class CascadingFieldsHostComponent implements OnInit {
  public readonly form = inject(FormService<CascadeControls, never, never>).getFormGroup();
  public readonly states: FormValueModified[] = [];
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
    const {a, b, c} = this.form.controls;
    a.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      value ? enableControl('depends-on-a', b) : disableControl('depends-on-a', b);
    });
    b.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      b.enabled && value ? enableControl('depends-on-b', c) : disableControl('depends-on-b', c);
    });
  }
}

describe('FormModifiedDirective with cascading fields', () => {
  it('retains all changes while letting consumers exclude fields disabled by clearing their dependency', () => {
    const form = new FormGroup<CascadeControls>({
      a: new FormControl('', {nonNullable: true}),
      b: new FormControl('', {nonNullable: true}),
      c: new FormControl('', {nonNullable: true}),
    });
    disableControl('depends-on-a', form.controls.b, {emitEvent: false});
    disableControl('depends-on-b', form.controls.c, {emitEvent: false});
    TestBed.configureTestingModule({
      imports: [CascadingFieldsHostComponent],
      providers: [
        {provide: STORAGE, useValue: {getItem: () => null, setItem: () => {}}},
        {provide: FormService, useValue: {
          getFormGroup: () => form,
          initialValue: form.getRawValue(),
          patchFormValueChanges: EMPTY,
        }},
      ],
    });
    const fixture = TestBed.createComponent(CascadingFieldsHostComponent);
    const host = fixture.componentInstance;
    const modified = getFormModified$(form);
    fixture.detectChanges();
    TestBed.flushEffects();

    const element = (field: keyof CascadeControls) =>
      fixture.nativeElement.querySelector(`[data-field="${field}"]`) as HTMLInputElement | HTMLSelectElement;
    const edit = (field: keyof CascadeControls, value: string) => {
      markAsUiChange(form.controls[field]);
      element(field).value = value;
      element(field).dispatchEvent(new Event(field === 'c' ? 'change' : 'input', {bubbles: true}));
      fixture.detectChanges();
      TestBed.flushEffects();
    };

    expect(form.value).toEqual({a: ''});
    expect(element('b').disabled).toBe(true);
    expect(element('c').disabled).toBe(true);
    expect(modified()).toBeUndefined();

    edit('a', 'input A');
    expect(element('b').disabled).toBe(false);
    expect(element('c').disabled).toBe(true);
    edit('b', 'input B');
    expect(element('c').disabled).toBe(false);
    edit('c', 'selected');

    const filled = modified();
    expect(filled).toEqual({
      modified: true,
      diffs: [
        {path: ['a'], pathString: 'a', previousValue: '', currentValue: 'input A', disabled: false},
        {path: ['b'], pathString: 'b', previousValue: '', currentValue: 'input B', disabled: false},
        {path: ['c'], pathString: 'c', previousValue: '', currentValue: 'selected', disabled: false},
      ],
    });
    expect(filled?.diffs.filter(diff => diff.disabled !== true)).toHaveLength(3);

    edit('a', '');

    expect(form.controls.b.disabled).toBe(true);
    expect(form.controls.c.disabled).toBe(true);
    expect(element('b').disabled).toBe(true);
    expect(element('c').disabled).toBe(true);
    expect(form.value).toEqual({a: ''});
    expect(form.getRawValue()).toEqual({a: '', b: 'input B', c: 'selected'});
    const remaining = modified();
    expect(remaining).toEqual({
      modified: true,
      diffs: [
        {path: ['b'], pathString: 'b', previousValue: '', currentValue: 'input B', disabled: true},
        {path: ['c'], pathString: 'c', previousValue: '', currentValue: 'selected', disabled: true},
      ],
    });
    expect(remaining?.diffs.filter(diff => diff.disabled !== true)).toEqual([]);
    expect(getFormModified(form)).toEqual(remaining);
    expect(host.states.at(-1)).toEqual(remaining);
    expect(filled?.diffs.every(diff => diff.disabled === false)).toBe(true);

    edit('a', 'input A');

    expect(element('b').disabled).toBe(false);
    expect(element('c').disabled).toBe(false);
    expect(form.value).toEqual({a: 'input A', b: 'input B', c: 'selected'});
    expect(modified()).toEqual(filled);
    expect(modified()?.diffs.filter(diff => diff.disabled !== true)).toHaveLength(3);
    expect(host.states.at(-1)).toEqual(filled);
  });
});
