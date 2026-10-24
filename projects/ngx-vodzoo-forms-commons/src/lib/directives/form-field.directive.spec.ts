import {Component, Injectable, Input, computed, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TestBed} from '@angular/core/testing';
import {AbstractControl, FormControl, FormControlStatus, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FormService} from '../services/form.service';
import {getRootFormValueChanges, getRootFormValueChanges$} from '../formValues';
import {FormDirective, FormValue, ValueChanges} from './form.directive';
import {FormFieldDirective, isChangedByUiUnset, isDataChangedByUi, isResetChange} from './form-field.directive';

type TestOption = {id: number; label: string};
type TestUserTypes = TestOption | Date | string[];
type TestFieldValue = string | number | boolean | null | TestUserTypes;
type TestControls = {name: FormControl<TestFieldValue>; email: FormControl<string>};

@Injectable()
class TestFormService extends FormService<TestControls, never, TestUserTypes> {
  protected override fromGroupConfig(initialValue?: FormValue<TestControls, TestUserTypes> | null): FormGroup<TestControls> {
    return new FormGroup({
      name: this.fb.nonNullable.control<TestFieldValue>(initialValue?.name === undefined ? 'Jan Kowalski' : initialValue.name),
      email: this.fb.nonNullable.control(initialValue?.email ?? 'jan@example.test')
    });
  }
}

@Component({
  selector: 'test-text-field',
  standalone: true,
  imports: [ReactiveFormsModule],
  hostDirectives: [FormFieldDirective],
  template: '<input [formControl]="field.formControl$()" (blur)="field.onTouched()">'
})
class TestTextFieldComponent {
  readonly field = inject(FormFieldDirective<TestFieldValue>);
  readonly valueEvents: TestFieldValue[] = [];
  readonly statusEvents: FormControlStatus[] = [];

  constructor() {
    this.field.formControl$().valueChanges.pipe(takeUntilDestroyed()).subscribe(value => this.valueEvents.push(value));
    this.field.formControl$().statusChanges.pipe(takeUntilDestroyed()).subscribe(status => this.statusEvents.push(status));
  }
}

@Component({
  standalone: true,
  imports: [FormDirective, ReactiveFormsModule, TestTextFieldComponent],
  providers: [TestFormService, {provide: FormService, useExisting: TestFormService}],
  template: `
    <form vForm #form="vForm" [saveDataWithService]="false">
      <section [formGroup]="form.form$()">
        <test-text-field data-testid="name" formControlName="name" />
        <test-text-field data-testid="email" formControlName="email" />
      </section>
    </form>
  `
})
class TestHostComponent {}

type AddressControls = {street: FormControl<string>};
type NestedControls = {address: FormGroup<AddressControls>};

@Injectable()
class TestAddressService extends FormService<AddressControls, never, never> {
  protected override fromGroupConfig(initialValue?: FormValue<AddressControls, never> | null): FormGroup<AddressControls> {
    return this.fb.nonNullable.group({street: initialValue?.street ?? 'Prosta'});
  }
}

@Injectable()
class TestNestedService extends FormService<NestedControls, never, never> {
  private readonly addressService = inject(TestAddressService);

  protected override fromGroupConfig(): FormGroup<NestedControls> {
    return new FormGroup({address: this.addressService.getFormGroup()});
  }
}

@Component({
  selector: 'test-address-form',
  standalone: true,
  imports: [FormDirective, ReactiveFormsModule, TestTextFieldComponent],
  providers: [TestAddressService, {provide: FormService, useExisting: TestAddressService}],
  template: `
    <section vForm #form="vForm" [form]="group" [formGroup]="form.form$()">
      <test-text-field data-testid="street" formControlName="street" />
    </section>
  `
})
class TestAddressHostComponent {
  @Input({required: true}) group!: FormGroup<AddressControls>;
}

@Component({
  standalone: true,
  imports: [FormDirective, TestAddressHostComponent],
  providers: [TestNestedService, TestAddressService, {provide: FormService, useExisting: TestNestedService}],
  template: `
    <form vForm #root="vForm" [saveDataWithService]="false">
      <test-address-form [group]="$any(root.form$()).controls.address" />
    </form>
  `
})
class TestNestedHostComponent {}

type PairedAddressControls = {billing: FormGroup<AddressControls>; shipping: FormGroup<AddressControls>};

@Injectable()
class TestPairedAddressService extends FormService<PairedAddressControls, never, never> {
  private readonly addressService = inject(TestAddressService);

  protected override fromGroupConfig(): FormGroup<PairedAddressControls> {
    return new FormGroup({
      billing: this.addressService.getFormGroup({street: 'Lipowa'}),
      shipping: this.addressService.getFormGroup({street: 'Sosnowa'})
    });
  }
}

@Component({
  standalone: true,
  imports: [FormDirective, TestAddressHostComponent],
  providers: [TestPairedAddressService, TestAddressService, {provide: FormService, useExisting: TestPairedAddressService}],
  template: `
    <form vForm #root="vForm" [saveDataWithService]="false">
      <test-address-form data-testid="billing" [group]="$any(root.form$()).controls.billing" />
      <test-address-form data-testid="shipping" [group]="$any(root.form$()).controls.shipping" />
    </form>
  `
})
class TestPairedAddressHostComponent {}

describe('FormFieldDirective', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TestHostComponent, TestNestedHostComponent, TestPairedAddressHostComponent]
    });
  });

  it('should create an instance', () => {
    const {field} = createForm();
    expect(field).toBeTruthy();
  });

  it('binds to the named control created by the form service', () => {
    const {field, form, beforeTimers} = createForm();

    expect(Object.is(beforeTimers.baseControl, form.controls.name)).toBe(true);
    expect(Object.is(field.baseControl$(), form.controls.name)).toBe(true);
    expect(Object.is(field.formControl$(), form.controls.name)).toBe(false);
    for (const control of [form.controls.name, form.controls.email]) {
      expect(Object.is(control.parent, form)).toBe(true);
      expect(Object.is(control.root, form)).toBe(true);
    }
  });

  it('exposes the initialized control name and field host classes', () => {
    const {field, beforeTimers, nameHost, emailHost} = createForm();

    expect(beforeTimers.name).toBe('name');
    expect(field.formControlName$()).toBe('name');
    expect(nameHost.classList.contains('form-field')).toBe(true);
    expect(emailHost.classList.contains('form-field')).toBe(true);
    expect(nameHost.classList.contains('name')).toBe(true);
    expect(nameHost.classList.contains('email')).toBe(false);
    expect(emailHost.classList.contains('email')).toBe(true);
    expect(emailHost.classList.contains('name')).toBe(false);
  });

  it.each(['Jan Kowalski', 'Anna Nowak', '  Zażółć gęślą  ', '', 0, 42, -2.5, false, true, null, '0', 'false', 'null'])('initializes the field and input with %j', initialName => {
    const {field, form, input, beforeTimers} = createForm(initialName);
    const displayedValue = initialName === null ? '' : String(initialName);

    expect(beforeTimers.value).toBe(initialName);
    expect(beforeTimers.localValue).toBe(initialName);
    expect(beforeTimers.inputValue).toBe(displayedValue);
    expect(form.controls.name.value).toBe(initialName);
    expect(field.formControl$().value).toBe(initialName);
    expect(field.value$()).toBe(initialName);
    expect(input.value).toBe(displayedValue);
  });

  const payloadCases: {label: string; createValue: () => TestFieldValue}[] = [
    {label: 'an array with meaningful order', createValue: () => ['B', 'A']},
    {label: 'an empty array', createValue: () => []},
    {label: 'an option object', createValue: () => ({id: 7, label: 'Wybrana opcja'})},
    {label: 'a Date', createValue: () => new Date('2026-04-15T12:34:56.789Z')}
  ];

  it.each(payloadCases)('preserves the type and contents of $label during initialization', ({createValue}) => {
    const initialValue = createValue();
    // Build independent expected data so an in-place mutation cannot change both sides.
    const expected = createValue();
    const {field, form, input, beforeTimers} = createForm(initialValue);

    expect(initialValue).toEqual(expected);
    expect(beforeTimers.value).toEqual(expected);
    expect(beforeTimers.localValue).toEqual(expected);
    expect(beforeTimers.inputValue).toBe(String(expected));
    expect(form.controls.name.value).toEqual(expected);
    expect(field.formControl$().value).toEqual(expected);
    expect(field.value$()).toEqual(expected);
    expect(input.value).toBe(String(expected));
  });

  it('initializes sibling fields with their own controls, names and values', () => {
    const {field, emailField, form, emailInput} = createForm('Anna Nowak');

    expect(Object.is(emailField.baseControl$(), form.controls.email)).toBe(true);
    expect(Object.is(emailField.baseControl$(), field.baseControl$())).toBe(false);
    expect(Object.is(emailField.formControl$(), field.formControl$())).toBe(false);
    expect(emailField.formControlName$()).toBe('email');
    expect(emailField.formControl$().value).toBe('jan@example.test');
    expect(emailField.value$()).toBe('jan@example.test');
    expect(emailInput.value).toBe('jan@example.test');
    expect(form.getRawValue()).toEqual({name: 'Anna Nowak', email: 'jan@example.test'});
  });

  it('distinguishes controls and names when sibling fields have identical initial values', () => {
    const {field, emailField, form} = createForm('jan@example.test');

    expect([field.formControlName$(), emailField.formControlName$()]).toEqual(['name', 'email']);
    expect(Object.is(field.baseControl$(), form.controls.name)).toBe(true);
    expect(Object.is(emailField.baseControl$(), form.controls.email)).toBe(true);
    expect(Object.is(field.baseControl$(), emailField.baseControl$())).toBe(false);
    expect([field.value$(), emailField.value$()]).toEqual(['jan@example.test', 'jan@example.test']);
  });

  it('initializes two live forms with independent controls and preserves the first form values', () => {
    const first = createForm('Anna Nowak');
    const second = createForm('Ewa Kowalska');

    for (const {field, emailField, form} of [first, second]) {
      expect(Object.is(field.baseControl$(), form.controls.name)).toBe(true);
      expect(Object.is(emailField.baseControl$(), form.controls.email)).toBe(true);
    }
    expect(Object.is(first.form, second.form)).toBe(false);
    expect(Object.is(first.field.formControl$(), second.field.formControl$())).toBe(false);
    expect(Object.is(first.emailField.formControl$(), second.emailField.formControl$())).toBe(false);
    expect(first.form.getRawValue()).toEqual({name: 'Anna Nowak', email: 'jan@example.test'});
    expect(first.field.value$()).toBe('Anna Nowak');
    expect(first.field.formControl$().value).toBe('Anna Nowak');
    expect(first.input.value).toBe('Anna Nowak');
    expect(second.form.getRawValue()).toEqual({name: 'Ewa Kowalska', email: 'jan@example.test'});
    expect(second.field.value$()).toBe('Ewa Kowalska');
    expect(second.field.formControl$().value).toBe('Ewa Kowalska');
    expect(second.input.value).toBe('Ewa Kowalska');
  });

  it('keeps valid fields and the form pristine, untouched and enabled during initialization', () => {
    const {field, emailField, form} = createForm();

    for (const control of [form, form.controls.name, form.controls.email, field.formControl$(), emailField.formControl$()]) {
      expect(control.pristine).toBe(true);
      expect(control.untouched).toBe(true);
      expect(control.enabled).toBe(true);
      expect(control.valid).toBe(true);
      expect(control.errors).toBeNull();
      expect(isChangedByUiUnset(control)).toBe(true);
      expect(isResetChange(control)).toBe(false);
    }
    expect(field.isDisabled$()).toBe(false);
    expect(emailField.isDisabled$()).toBe(false);
    expect(isDataChangedByUi(form)).toBe(false);
    expect(isChangedByUiUnset(form)).toBe(true);
  });

  it('initializes without model writeback or duplicate local value and status emissions', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    const service = fixture.debugElement.injector.get(TestFormService);
    const form = service.getFormGroup();
    // Keep the real service-created group observable before Angular binds its fields.
    vi.spyOn(service, 'getFormGroup').mockReturnValue(form);
    const modelValues = vi.fn();
    const modelStatuses = vi.fn();
    const observedControls: AbstractControl[] = [form, form.controls.name, form.controls.email];
    const subscriptions = observedControls.flatMap(control => [
      control.valueChanges.subscribe(modelValues),
      control.statusChanges.subscribe(modelStatuses)
    ]);

    try {
      fixture.detectChanges();
      expect(modelValues).not.toHaveBeenCalled();
      expect(modelStatuses).not.toHaveBeenCalled();
      const components = fixture.debugElement.queryAll(By.directive(TestTextFieldComponent))
        .map(element => element.componentInstance as TestTextFieldComponent);
      expect(components).toHaveLength(2);

      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      // Angular can validate the same bound controls again without changing their data.
      for (const control of [form.controls.name, form.controls.email]) {
        control.updateValueAndValidity({onlySelf: true, emitEvent: false});
      }
      vi.runOnlyPendingTimers();
      fixture.detectChanges();

      expect(modelValues).not.toHaveBeenCalled();
      expect(modelStatuses).not.toHaveBeenCalled();
      for (const component of components) {
        const expectedValue = form.getRawValue()[component.field.formControlName$() as keyof TestControls];
        // A silent initial write is allowed; repeated notifications of the same data are not.
        expect(component.valueEvents.length).toBeLessThanOrEqual(1);
        expect(component.valueEvents.every(value => value === expectedValue)).toBe(true);
        expect(component.statusEvents.length).toBeLessThanOrEqual(1);
        expect(component.statusEvents.every(status => status === 'VALID')).toBe(true);
      }
      expect(form.getRawValue()).toEqual({name: 'Jan Kowalski', email: 'jan@example.test'});
    } finally {
      subscriptions.forEach(subscription => subscription.unsubscribe());
    }
  });

  it('initializes a field against its own nested form group and preserves the root tree', () => {
    const fixture = TestBed.createComponent(TestNestedHostComponent);
    fixture.detectChanges();

    const root = fixture.debugElement.query(By.directive(FormDirective)).injector.get(FormDirective<NestedControls, never, never>).form$();
    const address = root.controls.address;
    const fieldElement = fixture.debugElement.query(By.css('[data-testid="street"]'));
    const field = fieldElement.injector.get(FormFieldDirective<TestFieldValue>);
    const input = fieldElement.query(By.css('input')).nativeElement as HTMLInputElement;
    const initial = {baseControl: field.baseControl$(), name: field.formControlName$(), value: field.value$()};
    vi.runOnlyPendingTimers();
    fixture.detectChanges();

    expect(Object.is(initial.baseControl, address.controls.street)).toBe(true);
    expect(initial.name).toBe('street');
    expect(initial.value).toBe('Prosta');
    expect(Object.is(field.baseControl$(), address.controls.street)).toBe(true);
    expect(Object.is(address.parent, root)).toBe(true);
    expect(Object.is(address.controls.street.parent, address)).toBe(true);
    expect(Object.is(address.controls.street.root, root)).toBe(true);
    expect(field.formControlName$()).toBe('street');
    expect(field.formControl$().value).toBe('Prosta');
    expect(field.value$()).toBe('Prosta');
    expect(input.value).toBe('Prosta');
    expect(root.getRawValue()).toEqual({address: {street: 'Prosta'}});
  });

  it('keeps same-named fields in sibling nested forms independent within one root', () => {
    const fixture = TestBed.createComponent(TestPairedAddressHostComponent);
    fixture.detectChanges();
    const root = fixture.debugElement.query(By.directive(FormDirective))
      .injector.get(FormDirective<PairedAddressControls, never, never>).form$();
    const expected = {billing: 'Lipowa', shipping: 'Sosnowa'};
    const entries = (['billing', 'shipping'] as const).map(key => {
      const element = fixture.debugElement.query(By.css(`[data-testid="${key}"] [data-testid="street"]`));
      const field = element.injector.get(FormFieldDirective<TestFieldValue>);
      const input = element.query(By.css('input')).nativeElement as HTMLInputElement;
      return {key, field, input, initial: {baseControl: field.baseControl$(), name: field.formControlName$(), value: field.value$()}};
    });
    vi.runOnlyPendingTimers();
    fixture.detectChanges();

    for (const {key, field, input, initial} of entries) {
      const group = root.controls[key];
      expect(Object.is(initial.baseControl, group.controls.street)).toBe(true);
      expect(initial.name).toBe('street');
      expect(initial.value).toBe(expected[key]);
      expect(Object.is(field.baseControl$(), group.controls.street)).toBe(true);
      expect(Object.is(group.parent, root)).toBe(true);
      expect(Object.is(group.controls.street.parent, group)).toBe(true);
      expect(Object.is(group.controls.street.root, root)).toBe(true);
      expect(field.formControlName$()).toBe('street');
      expect(field.formControl$().value).toBe(expected[key]);
      expect(field.value$()).toBe(expected[key]);
      expect(input.value).toBe(expected[key]);
    }
    expect(Object.is(entries[0].field.formControl$(), entries[1].field.formControl$())).toBe(false);
    expect(root.getRawValue()).toEqual({billing: {street: 'Lipowa'}, shipping: {street: 'Sosnowa'}});
  });

  describe('model to field after initialization', () => {
    const methods = ['setValue', 'patchValue'] as const;
    const valueCases = [
      ...['  Zażółć gęślą  ', '', 0, -2.5, false, true, null, '0', 'false', 'null'].map(value => ({
        label: JSON.stringify(value), createValue: (): TestFieldValue => value
      })),
      ...payloadCases
    ];

    it.each(methods.flatMap(method => valueCases.map(testCase => ({method, ...testCase}))))(
      '$method propagates $label from the model to the local control, signal and input',
      ({method, createValue}) => {
        const context = createForm('Before update');
        const events = observeModelWrites(context);
        const value = createValue();
        const expected = createValue();
        const baseControl = context.form.controls.name;
        const localControl = context.field.formControl$();

        baseControl[method](value);

        expect(value).toEqual(expected);
        expect(baseControl.value).toEqual(expected);
        expect(context.field.formControl$().value).toEqual(expected);
        expect(context.field.value$()).toEqual(expected);
        expect(context.input.value).toBe(expected === null ? '' : String(expected));
        context.fixture.detectChanges();
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
        expect(context.field.formControl$().value).toEqual(expected);
        expect(context.field.value$()).toEqual(expected);
        expect(context.input.value).toBe(expected === null ? '' : String(expected));
        expect(Object.is(context.field.baseControl$(), baseControl)).toBe(true);
        expect(Object.is(context.field.formControl$(), localControl)).toBe(true);
        expect(context.form.controls.email.value).toBe('jan@example.test');
        expect(context.emailField.value$()).toBe('jan@example.test');
        expect(context.emailInput.value).toBe('jan@example.test');
        expect(events.controlValues).toEqual([expected]);
        expect(events.controlStatuses).toEqual(['VALID']);
        const current = {name: expected, email: 'jan@example.test'};
        const previous = {name: 'Before update', email: 'jan@example.test'};
        expect(events.formValues).toEqual([current]);
        expect(events.formStatuses).toEqual(['VALID']);
        expect(events.outputs).toEqual([{
          uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
          previous: {value: previous, rawValue: previous}, current: {value: current, rawValue: current}
        }]);
        // An implementation may write silently; one update must not duplicate local notifications.
        expect(events.localValues.length).toBeLessThanOrEqual(1);
        events.localValues.forEach(value => expect(value).toEqual(expected));
        expect(events.localStatuses.length).toBeLessThanOrEqual(1);
        expect(events.localStatuses.every(status => status === 'VALID')).toBe(true);
      }
    );

    it.each(methods)('%s emits once per model write and reports programmatic changes without UI flags', method => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);
      const values = ['Anna Nowak', 'Ewa Kowalska', 'Ewa Kowalska'];

      for (const value of values) {
        context.form.controls.name[method](value);
        expect(context.field.formControl$().value).toBe(value);
        expect(context.field.value$()).toBe(value);
        expect(context.input.value).toBe(value);
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
      }

      expect(events.controlValues).toEqual(values);
      expect(events.controlStatuses).toEqual(['VALID', 'VALID', 'VALID']);
      expect(events.formValues).toEqual(values.map(name => ({name, email: 'jan@example.test'})));
      expect(events.formStatuses).toEqual(['VALID', 'VALID', 'VALID']);
      const snapshot = (name: string) => ({
        value: {name, email: 'jan@example.test'},
        rawValue: {name, email: 'jan@example.test'}
      });
      // Angular emits for an explicit same-value write; the form output filters unchanged data.
      expect(events.outputs).toEqual([
        {uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
          previous: snapshot('Before update'), current: snapshot('Anna Nowak')},
        {uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
          previous: snapshot('Anna Nowak'), current: snapshot('Ewa Kowalska')}
      ]);
      for (const control of [context.form, context.form.controls.name, context.field.formControl$()]) {
        expect(control.pristine).toBe(true);
        expect(control.untouched).toBe(true);
      }
    });

    it.each(methods)('%s with emitEvent:false updates the field without model emissions or writeback', method => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);

      for (const {createValue} of valueCases) {
        const value = createValue();
        const expected = createValue();
        context.form.controls.name[method](value, {emitEvent: false});
        expect(value).toEqual(expected);
        expect(context.form.controls.name.value).toEqual(expected);
        expect(context.field.formControl$().value).toEqual(expected);
        expect(context.field.value$()).toEqual(expected);
        expect(context.input.value).toBe(expected === null ? '' : String(expected));
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
        expect(context.field.formControl$().value).toEqual(expected);
        expect(context.field.value$()).toEqual(expected);
        expect(context.input.value).toBe(expected === null ? '' : String(expected));
      }

      expect(events.controlValues).toEqual([]);
      expect(events.controlStatuses).toEqual([]);
      expect(events.formValues).toEqual([]);
      expect(events.formStatuses).toEqual([]);
      expect(events.outputs).toEqual([]);
      expect(isChangedByUiUnset(context.form)).toBe(true);

      context.form.controls.name[method]('Visible update');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.field.value$()).toBe('Visible update');
      expect(context.field.formControl$().value).toBe('Visible update');
      expect(context.input.value).toBe('Visible update');
      expect(events.controlValues).toEqual(['Visible update']);
      expect(events.controlStatuses).toEqual(['VALID']);
      expect(events.formValues).toEqual([{name: 'Visible update', email: 'jan@example.test'}]);
      expect(events.formStatuses).toEqual(['VALID']);
      expect(events.outputs).toEqual([expect.objectContaining({
        uiChange: false, firstUiChange: false,
        current: {value: {name: 'Visible update', email: 'jan@example.test'},
          rawValue: {name: 'Visible update', email: 'jan@example.test'}}
      })]);
    });

    const repeatedPayloads: {label: string; first: () => TestUserTypes; second: () => TestUserTypes}[] = [
      {label: 'arrays', first: () => ['B', 'A'], second: () => ['D', 'C', 'E']},
      {label: 'option objects', first: () => ({id: 7, label: 'First option'}), second: () => ({id: 9, label: 'Second option'})},
      {label: 'dates', first: () => new Date('2026-04-15T12:34:56.789Z'), second: () => new Date('2027-09-03T01:02:03.004Z')}
    ];

    it.each(repeatedPayloads)('preserves earlier $label and refreshes computed consumers on subsequent writes', ({first, second}) => {
      const context = createForm('Before update');
      const projected = computed(() => JSON.stringify(context.field.value$()));
      const firstValue = first();
      const expectedFirst = first();
      const secondValue = second();
      const expectedSecond = second();
      expect(projected()).toBe(JSON.stringify('Before update'));

      context.form.controls.name.setValue(firstValue);
      expect(context.field.formControl$().value).toEqual(expectedFirst);
      expect(projected()).toBe(JSON.stringify(expectedFirst));
      expect(context.input.value).toBe(String(expectedFirst));

      context.form.controls.name.patchValue(secondValue);
      expect(firstValue).toEqual(expectedFirst);
      expect(secondValue).toEqual(expectedSecond);
      expect(context.form.controls.name.value).toEqual(expectedSecond);
      expect(context.field.formControl$().value).toEqual(expectedSecond);
      expect(context.field.value$()).toEqual(expectedSecond);
      expect(projected()).toBe(JSON.stringify(expectedSecond));
      expect(context.input.value).toBe(String(expectedSecond));
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(firstValue).toEqual(expectedFirst);
      expect(projected()).toBe(JSON.stringify(expectedSecond));
      expect(context.field.formControl$().value).toEqual(expectedSecond);
      expect(context.input.value).toBe(String(expectedSecond));
    });

    it.each(methods)('%s applies consecutive writes synchronously before pending timers run', method => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);
      const values = ['Quick first', 'Quick last'];

      for (const value of values) {
        const localCount = events.localValues.length;
        context.form.controls.name[method](value);
        expect(context.form.controls.name.value).toBe(value);
        expect(context.field.formControl$().value).toBe(value);
        expect(context.field.value$()).toBe(value);
        expect(context.input.value).toBe(value);
        expect(events.localValues.length - localCount).toBeLessThanOrEqual(1);
        events.localValues.slice(localCount).forEach(emitted => expect(emitted).toBe(value));
      }

      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.field.formControl$().value).toBe('Quick last');
      expect(context.field.value$()).toBe('Quick last');
      expect(context.input.value).toBe('Quick last');
      expect(events.controlValues).toEqual(values);
      expect(events.formValues).toEqual(values.map(name => ({name, email: 'jan@example.test'})));
      expect(events.outputs.map(event => [event.uiChange, event.firstUiChange])).toEqual([[false, false], [false, false]]);
    });

    it('keeps model writes independent between two simultaneously active forms with the same field paths', () => {
      const first = createForm('First form');
      const second = createForm('Second form');
      const firstEvents = observeModelWrites(first);
      const secondEvents = observeModelWrites(second);
      const expectForms = (firstName: string, secondName: string) => {
        for (const [context, name] of [[first, firstName], [second, secondName]] as const) {
          expect(context.form.getRawValue()).toEqual({name, email: 'jan@example.test'});
          expect(context.field.formControl$().value).toBe(name);
          expect(context.field.value$()).toBe(name);
          expect(context.input.value).toBe(name);
          expect(Object.is(context.field.baseControl$(), context.form.controls.name)).toBe(true);
        }
      };

      first.form.controls.name.setValue('First update');
      expectForms('First update', 'Second form');
      second.form.controls.name.patchValue('Second update');
      expectForms('First update', 'Second update');
      first.form.controls.name.setValue('First final');
      expectForms('First final', 'Second update');
      vi.runOnlyPendingTimers();
      first.fixture.detectChanges();
      second.fixture.detectChanges();
      expectForms('First final', 'Second update');
      expect(firstEvents.controlValues).toEqual(['First update', 'First final']);
      expect(secondEvents.controlValues).toEqual(['Second update']);
      expect(firstEvents.formValues).toEqual([
        {name: 'First update', email: 'jan@example.test'},
        {name: 'First final', email: 'jan@example.test'}
      ]);
      expect(secondEvents.formValues).toEqual([{name: 'Second update', email: 'jan@example.test'}]);
      expect(firstEvents.outputs.map(event => event.uiChange)).toEqual([false, false]);
      expect(secondEvents.outputs.map(event => event.uiChange)).toEqual([false]);
    });

    const interactionStates = [
      {label: 'dirty and touched', dirty: true, touched: true},
      {label: 'dirty and untouched', dirty: true, touched: false},
      {label: 'pristine and touched', dirty: false, touched: true}
    ];

    it.each(methods.flatMap(method => interactionStates.map(state => ({method, ...state}))))(
      '$method preserves existing $label state during an ordinary model write',
      ({method, dirty, touched}) => {
        const context = createForm('Before update');
        for (const control of [context.field.formControl$(), context.form.controls.name]) {
          if (dirty) control.markAsDirty();
          if (touched) control.markAsTouched();
        }
        const events = observeModelWrites(context);
        const expectState = () => {
          for (const control of [context.form, context.form.controls.name, context.field.formControl$()]) {
            expect(control.dirty).toBe(dirty);
            expect(control.touched).toBe(touched);
          }
        };
        expectState();

        context.form.controls.name[method]('Updated field');
        expectState();
        expect(context.field.formControl$().value).toBe('Updated field');
        expect(context.field.value$()).toBe('Updated field');
        expect(context.input.value).toBe('Updated field');
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
        expectState();
        expect(events.controlValues).toEqual(['Updated field']);
        expect(events.formValues).toEqual([{name: 'Updated field', email: 'jan@example.test'}]);
        expect(events.outputs.map(event => [event.uiChange, event.firstUiChange])).toEqual([[false, false]]);
      }
    );

    it.each(methods)('%s with onlySelf updates the leaf without refreshing or emitting its parent', method => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);
      const previous = {name: 'Before update', email: 'jan@example.test'};
      const current = {name: 'Leaf only', email: 'jan@example.test'};

      context.form.controls.name[method]('Leaf only', {onlySelf: true});
      expect(context.form.controls.name.value).toBe('Leaf only');
      expect(context.field.formControl$().value).toBe('Leaf only');
      expect(context.field.value$()).toBe('Leaf only');
      expect(context.input.value).toBe('Leaf only');
      expect(context.form.value).toEqual(previous);
      expect(context.form.getRawValue()).toEqual(current);
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.form.value).toEqual(previous);
      expect(events.controlValues).toEqual(['Leaf only']);
      expect(events.controlStatuses).toEqual(['VALID']);
      expect(events.formValues).toEqual([]);
      expect(events.formStatuses).toEqual([]);
      expect(events.outputs).toEqual([]);

      context.form.updateValueAndValidity();
      expect(context.form.value).toEqual(current);
      expect(events.controlValues).toEqual(['Leaf only']);
      expect(events.formValues).toEqual([current]);
      expect(events.formStatuses).toEqual(['VALID']);
      expect(events.outputs).toEqual([{
        uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
        previous: {value: previous, rawValue: previous}, current: {value: current, rawValue: current}
      }]);
    });

    it.each(methods)('%s respects emitModelToViewChange:false and resumes normal view updates afterwards', method => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);
      for (const {value, emitEvent} of [
        {value: 'Hidden with events', emitEvent: true},
        {value: 'Hidden silently', emitEvent: false}
      ]) {
        context.form.controls.name[method](value, {emitModelToViewChange: false, emitEvent});
        expect(context.form.getRawValue()).toEqual({name: value, email: 'jan@example.test'});
        expect(context.field.formControl$().value).toBe('Before update');
        expect(context.field.value$()).toBe('Before update');
        expect(context.input.value).toBe('Before update');
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
        expect(context.field.formControl$().value).toBe('Before update');
        expect(context.field.value$()).toBe('Before update');
        expect(context.input.value).toBe('Before update');
      }
      expect(events.controlValues).toEqual(['Hidden with events']);
      expect(events.formValues).toEqual([{name: 'Hidden with events', email: 'jan@example.test'}]);
      expect(events.localValues).toEqual([]);
      expect(events.localStatuses).toEqual([]);

      context.form.controls.name[method]('Resumed view');
      expect(context.field.formControl$().value).toBe('Resumed view');
      expect(context.field.value$()).toBe('Resumed view');
      expect(context.input.value).toBe('Resumed view');
      expect(events.controlValues).toEqual(['Hidden with events', 'Resumed view']);
      expect(events.formValues).toEqual([
        {name: 'Hidden with events', email: 'jan@example.test'},
        {name: 'Resumed view', email: 'jan@example.test'}
      ]);
      expect(events.outputs.map(event => [event.uiChange, event.firstUiChange])).toEqual([[false, false], [false, false]]);
    });

    it('keeps cached values of a nested group and root unchanged for a leaf-only update', () => {
      const fixture = TestBed.createComponent(TestPairedAddressHostComponent);
      fixture.detectChanges();
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      const directive = fixture.debugElement.query(By.directive(FormDirective))
        .injector.get(FormDirective<PairedAddressControls, never, never>);
      const root = directive.form$();
      const group = root.controls.billing;
      const element = fixture.debugElement.query(By.css('[data-testid="billing"] [data-testid="street"]'));
      const field = element.injector.get(FormFieldDirective<TestFieldValue>);
      const input = element.query(By.css('input')).nativeElement as HTMLInputElement;
      const groupValues: unknown[] = [];
      const rootValues: unknown[] = [];
      const outputs: ValueChanges<PairedAddressControls, never>[] = [];
      const subscriptions = [group.valueChanges.subscribe(value => groupValues.push(value)),
        root.valueChanges.subscribe(value => rootValues.push(value)),
        directive.valueChanged.subscribe(value => outputs.push(value))];
      fixture.componentRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

      group.controls.street.patchValue('Nested leaf only', {onlySelf: true});
      expect(field.formControl$().value).toBe('Nested leaf only');
      expect(field.value$()).toBe('Nested leaf only');
      expect(input.value).toBe('Nested leaf only');
      const previous = {billing: {street: 'Lipowa'}, shipping: {street: 'Sosnowa'}};
      const current = {billing: {street: 'Nested leaf only'}, shipping: {street: 'Sosnowa'}};
      expect(group.value).toEqual(previous.billing);
      expect(root.value).toEqual(previous);
      expect(root.getRawValue()).toEqual(current);
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      expect(group.value).toEqual(previous.billing);
      expect(root.value).toEqual(previous);
      expect(groupValues).toEqual([]);
      expect(rootValues).toEqual([]);
      expect(outputs).toEqual([]);

      group.updateValueAndValidity();
      expect(group.value).toEqual(current.billing);
      expect(root.value).toEqual(current);
      expect(groupValues).toEqual([current.billing]);
      expect(rootValues).toEqual([current]);
      expect(outputs).toEqual([{
        uiChange: false, firstUiChange: false, dataChanged: true, rawDataChanged: true,
        previous: {value: previous, rawValue: previous}, current: {value: current, rawValue: current}
      }]);
    });

    it('routes group patchValue updates to their own fields without changing the sibling', () => {
      const context = createForm('Before update');
      const events = observeModelWrites(context);

      context.form.patchValue({name: 'Group update'});
      context.fixture.detectChanges();
      expect(context.field.formControl$().value).toBe('Group update');
      expect(context.field.value$()).toBe('Group update');
      expect(context.input.value).toBe('Group update');
      expect(context.form.controls.email.value).toBe('jan@example.test');
      expect(context.emailField.formControl$().value).toBe('jan@example.test');
      expect(context.emailField.value$()).toBe('jan@example.test');
      expect(context.emailInput.value).toBe('jan@example.test');

      context.form.patchValue({email: 'anna@example.test'});
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.form.getRawValue()).toEqual({name: 'Group update', email: 'anna@example.test'});
      expect(context.emailField.formControl$().value).toBe('anna@example.test');
      expect(context.emailField.value$()).toBe('anna@example.test');
      expect(context.emailInput.value).toBe('anna@example.test');
      expect(context.field.formControl$().value).toBe('Group update');
      expect(context.field.value$()).toBe('Group update');
      expect(context.input.value).toBe('Group update');
      expect(events.controlValues).toEqual(['Group update']);
      expect(events.formValues).toEqual([
        {name: 'Group update', email: 'jan@example.test'},
        {name: 'Group update', email: 'anna@example.test'}
      ]);
      expect(events.outputs).toHaveLength(2);
      expect(events.outputs.map(event => [event.uiChange, event.firstUiChange])).toEqual([[false, false], [false, false]]);
    });

    it('updates the correct same-named field in sibling nested forms', () => {
      const fixture = TestBed.createComponent(TestPairedAddressHostComponent);
      fixture.detectChanges();
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      const directive = fixture.debugElement.query(By.directive(FormDirective))
        .injector.get(FormDirective<PairedAddressControls, never, never>);
      const root = directive.form$();
      const fields = (['billing', 'shipping'] as const).map(key => {
        const element = fixture.debugElement.query(By.css(`[data-testid="${key}"] [data-testid="street"]`));
        return {field: element.injector.get(FormFieldDirective<TestFieldValue>),
          input: element.query(By.css('input')).nativeElement as HTMLInputElement};
      });
      const values: unknown[] = [];
      const outputs: ValueChanges<PairedAddressControls, never>[] = [];
      const subscriptions = [root.valueChanges.subscribe(value => values.push(value)),
        directive.valueChanged.subscribe(event => outputs.push(event))];
      fixture.componentRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

      root.patchValue({billing: {street: 'Polna'}});
      fixture.detectChanges();
      expect(fields.map(({field}) => field.formControl$().value)).toEqual(['Polna', 'Sosnowa']);
      expect(fields.map(({field}) => field.value$())).toEqual(['Polna', 'Sosnowa']);
      expect(fields.map(({input}) => input.value)).toEqual(['Polna', 'Sosnowa']);

      root.controls.shipping.controls.street.setValue('Leśna');
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      expect(fields.map(({field}) => field.formControl$().value)).toEqual(['Polna', 'Leśna']);
      expect(fields.map(({field}) => field.value$())).toEqual(['Polna', 'Leśna']);
      expect(fields.map(({input}) => input.value)).toEqual(['Polna', 'Leśna']);
      expect(Object.is(fields[0].field.baseControl$(), root.controls.billing.controls.street)).toBe(true);
      expect(Object.is(fields[1].field.baseControl$(), root.controls.shipping.controls.street)).toBe(true);
      expect(values).toEqual([
        {billing: {street: 'Polna'}, shipping: {street: 'Sosnowa'}},
        {billing: {street: 'Polna'}, shipping: {street: 'Leśna'}}
      ]);
      expect(root.getRawValue()).toEqual(values[1]);
      expect(outputs).toHaveLength(2);
      expect(outputs.map(event => [event.uiChange, event.firstUiChange, event.current.value]))
        .toEqual([[false, false, values[0]], [false, false, values[1]]]);
    });
  });

  describe('field to model through DOM input', () => {
    type Data = {name: TestFieldValue; email: string};
    const data = (name: TestFieldValue, email = 'jan@example.test'): Data => ({name, email});
    const change = (previous: Data, current: Data, uiChange: boolean, firstUiChange: boolean) => ({
      uiChange, firstUiChange, dataChanged: true, rawDataChanged: true,
      previous: {value: {...previous}, rawValue: {...previous}},
      current: {value: {...current}, rawValue: {...current}}
    });
    const enterObservedText = (context: ReturnType<typeof createForm>, events: ReturnType<typeof observeModelWrites>, value: string) => {
      const valueCount = events.localValues.length;
      const statusCount = events.localStatuses.length;
      enterText(context.input, value);
      expect(events.localValues.slice(valueCount)).toEqual([value]);
      expect(events.localStatuses.slice(statusCount)).toEqual(['VALID']);
    };

    it.each(['Anna Nowak', '  Zażółć gęślą  ', '   ', '', '0', 'false', 'null'])(
      'propagates the text %j once and publishes consistent state during the root output', value => {
        const context = createForm('Before input');
        const events = observeModelWrites(context);
        const baseControl = context.form.controls.name;
        const localControl = context.field.formControl$();
        const projected = computed(() => context.field.value$());
        expect(projected()).toBe('Before input');
        const projectedForm = computed(() => context.directive.valueChanges$());
        const rootChanges = getRootFormValueChanges$<TestControls, TestUserTypes>(context.form);
        const projectedChanges = computed(() => rootChanges());
        // Retain consumers before the input so stale signal dependencies are observable.
        projectedForm();
        expect(projectedChanges()).toBeUndefined();
        const duringOutput: unknown[] = [];
        const subscription = context.directive.valueChanged.subscribe(() => duringOutput.push({
          signal: context.field.value$(), projected: projected(), local: localControl.value,
          model: baseControl.value, form: context.form.getRawValue(), input: context.input.value,
          formSignal: projectedForm(), publishedChange: projectedChanges(),
          freshChange: getRootFormValueChanges<TestControls, TestUserTypes>(context.form)
        }));
        context.fixture.componentRef.onDestroy(() => subscription.unsubscribe());

        enterText(context.input, value);

        const expectPropagation = () => {
          expect(baseControl.value).toBe(value);
          expect(localControl.value).toBe(value);
          expect(context.field.value$()).toBe(value);
          expect(projected()).toBe(value);
          expect(context.input.value).toBe(value);
          expect(context.form.value).toEqual(data(value));
          expect(context.form.getRawValue()).toEqual(data(value));
          expect(context.directive.valueChanges$()).toEqual(data(value));
          expect(projectedForm()).toEqual(data(value));
          expect(projectedChanges()).toEqual(change(data('Before input'), data(value), true, true));
          expect(Object.is(context.field.baseControl$(), baseControl)).toBe(true);
          expect(Object.is(context.field.formControl$(), localControl)).toBe(true);
          expect(events).toEqual({
            localValues: [value], localStatuses: ['VALID'], controlValues: [value], controlStatuses: ['VALID'],
            formValues: [data(value)], formStatuses: ['VALID'],
            outputs: [change(data('Before input'), data(value), true, true)]
          });
          expect(duringOutput).toEqual([{
            signal: value, projected: value, local: value, model: value, form: data(value), input: value,
            formSignal: data(value), publishedChange: change(data('Before input'), data(value), true, true),
            freshChange: change(data('Before input'), data(value), true, true)
          }]);
          for (const control of [context.form, baseControl, localControl]) {
            expect(control.dirty).toBe(true);
            expect(control.untouched).toBe(true);
          }
          expect(context.form.controls.email.value).toBe('jan@example.test');
          expect(context.emailField.formControl$().value).toBe('jan@example.test');
          expect(context.emailField.value$()).toBe('jan@example.test');
          expect(context.emailInput.value).toBe('jan@example.test');
          for (const control of [context.form.controls.email, context.emailField.formControl$()]) {
            expect(control.pristine).toBe(true);
            expect(control.untouched).toBe(true);
          }
        };
        expectPropagation();
        vi.runOnlyPendingTimers();
        context.fixture.detectChanges();
        expectPropagation();
      }
    );

    it.each([
      {label: 'zero', createValue: (): TestFieldValue => 0},
      {label: 'false', createValue: (): TestFieldValue => false},
      {label: 'null', createValue: (): TestFieldValue => null},
      ...payloadCases.filter(testCase => testCase.label !== 'an empty array')
    ])('reads a string from the text input initially showing $label', ({createValue}) => {
      const initial = createValue();
      const expectedInitial = createValue();
      const context = createForm(initial);
      const events = observeModelWrites(context);
      const text = initial === null ? '' : String(initial);
      expect(context.input.value).toBe(text);

      // The displayed text can stay identical while the model changes from a typed payload to a string.
      enterText(context.input, text);

      expect(initial).toEqual(expectedInitial);
      expect(context.form.controls.name.value).toBe(text);
      expect(context.field.formControl$().value).toBe(text);
      expect(context.field.value$()).toBe(text);
      expect(events.controlValues).toEqual([text]);
      expect(events.formValues).toEqual([data(text)]);
      expect(events.outputs).toEqual([change(data(expectedInitial), data(text), true, true)]);
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.form.getRawValue()).toEqual(data(text));
      expect(context.input.value).toBe(text);
      expect(events.controlValues).toEqual([text]);
      expect(events.outputs).toHaveLength(1);
    });

    it.each([false, true])('keeps every consecutive edit when settling between inputs is %s', settleBetweenInputs => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      const projectedForm = computed(() => context.directive.valueChanges$());
      const projectedFormName = computed(() => context.directive.valueChanges$()?.name);
      const rootChanges = getRootFormValueChanges$<TestControls, TestUserTypes>(context.form);
      const projectedChanges = computed(() => rootChanges());
      const projectedChangeName = computed(() => rootChanges()?.current.value.name);
      projectedForm();
      projectedFormName();
      projectedChanges();
      projectedChangeName();
      const values = ['A', 'An', 'Anna', '', 'Before input'];
      const expectedOutputs = [
        change(data('Before input'), data('A'), true, true),
        change(data('A'), data('An'), true, false),
        change(data('An'), data('Anna'), true, false),
        change(data('Anna'), data(''), true, false),
        change(data(''), data('Before input'), true, false)
      ];

      values.forEach((value, index) => {
        enterText(context.input, value);
        expect(context.form.controls.name.value).toBe(value);
        expect(context.field.formControl$().value).toBe(value);
        expect(context.field.value$()).toBe(value);
        expect(context.form.getRawValue()).toEqual(data(value));
        expect(projectedForm()).toEqual(data(value));
        expect(projectedFormName()).toBe(value);
        expect(projectedChanges()).toEqual(expectedOutputs[index]);
        expect(projectedChangeName()).toBe(value);
        expect(events.localValues).toEqual(values.slice(0, index + 1));
        expect(events.controlValues).toEqual(values.slice(0, index + 1));
        expect(events.formValues).toEqual(values.slice(0, index + 1).map(value => data(value)));
        expect(events.outputs).toEqual(expectedOutputs.slice(0, index + 1));
        if (settleBetweenInputs) {
          vi.runOnlyPendingTimers();
          context.fixture.detectChanges();
        }
      });
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.field.value$()).toBe('Before input');
      expect(context.input.value).toBe('Before input');
      expect(projectedForm()).toEqual(data('Before input'));
      expect(projectedFormName()).toBe('Before input');
      expect(projectedChanges()).toEqual(expectedOutputs[4]);
      expect(projectedChangeName()).toBe('Before input');
      expect(events.localValues).toEqual(values);
      expect(events.controlValues).toEqual(values);
      expect(events.formValues).toEqual(values.map(value => data(value)));
      expect(events.localStatuses).toEqual(values.map(() => 'VALID'));
      expect(events.controlStatuses).toEqual(values.map(() => 'VALID'));
      expect(events.formStatuses).toEqual(values.map(() => 'VALID'));
      expect(events.outputs).toEqual(expectedOutputs);
    });

    it('does not consume the first UI change or leak its marker after identical input events', () => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);

      enterObservedText(context, events, 'Before input');
      expect(events.controlValues).toEqual(['Before input']);
      expect(events.formValues).toEqual([data('Before input')]);
      expect(events.outputs).toEqual([]);
      expect(context.form.dirty).toBe(true);
      expect(isChangedByUiUnset(context.form)).toBe(true);

      context.form.controls.name.setValue('From API');
      expect(events.outputs).toEqual([change(data('Before input'), data('From API'), false, false)]);
      enterObservedText(context, events, 'From API');
      expect(events.outputs).toHaveLength(1);
      expect(isChangedByUiUnset(context.form)).toBe(true);
      enterObservedText(context, events, 'First user edit');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();

      const values = ['Before input', 'From API', 'From API', 'First user edit'];
      expect(events.controlValues).toEqual(values);
      expect(events.formValues).toEqual(values.map(value => data(value)));
      expect(events.controlStatuses).toEqual(values.map(() => 'VALID'));
      expect(events.formStatuses).toEqual(values.map(() => 'VALID'));
      expect(events.outputs).toEqual([
        change(data('Before input'), data('From API'), false, false),
        change(data('From API'), data('First user edit'), true, true)
      ]);
      expect(context.field.value$()).toBe('First user edit');
      expect(context.form.getRawValue()).toEqual(data('First user edit'));
    });

    it('distinguishes UI, repeated input, model correction and a later UI change', () => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      enterObservedText(context, events, 'First edit');
      enterObservedText(context, events, 'First edit');
      context.form.controls.name.patchValue('Server correction');
      expect(context.input.value).toBe('Server correction');
      enterObservedText(context, events, 'Last edit');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();

      const values = ['First edit', 'First edit', 'Server correction', 'Last edit'];
      expect(events.controlValues).toEqual(values);
      expect(events.formValues).toEqual(values.map(value => data(value)));
      expect(events.outputs).toEqual([
        change(data('Before input'), data('First edit'), true, true),
        change(data('First edit'), data('Server correction'), false, false),
        change(data('Server correction'), data('Last edit'), true, false)
      ]);
      expect(context.field.value$()).toBe('Last edit');
      expect(context.input.value).toBe('Last edit');
    });

    it.each([
      {label: 'ordinary', options: {}, emits: true},
      {label: 'silent', options: {emitEvent: false}, emits: false},
      {label: 'view-suppressed', options: {emitModelToViewChange: false}, emits: true}
    ])('accepts the first UI edit after an $label model write', ({options, emits}) => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      context.form.controls.name.setValue('From API', options);
      enterObservedText(context, events, 'User edit');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();

      expect(context.form.controls.name.value).toBe('User edit');
      expect(context.field.formControl$().value).toBe('User edit');
      expect(context.field.value$()).toBe('User edit');
      expect(context.input.value).toBe('User edit');
      expect(events.controlValues).toEqual(emits ? ['From API', 'User edit'] : ['User edit']);
      expect(events.formValues).toEqual((emits ? ['From API', 'User edit'] : ['User edit']).map(value => data(value)));
      expect(events.outputs).toEqual(emits ? [
        change(data('Before input'), data('From API'), false, false),
        change(data('From API'), data('User edit'), true, true)
      ] : [change(data('Before input'), data('User edit'), true, true)]);
      expect(context.form.dirty).toBe(true);
      expect(context.form.untouched).toBe(true);
    });

    it('accepts an input before the deferred initialization timer runs', () => {
      const context = createForm('Before input', false);
      const events = observeModelWrites(context);
      enterObservedText(context, events, 'Early edit');
      expect(context.form.getRawValue()).toEqual(data('Early edit'));
      expect(context.field.value$()).toBe('Early edit');
      expect(events.outputs).toEqual([change(data('Before input'), data('Early edit'), true, true)]);
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expect(context.field.formControl$().value).toBe('Early edit');
      expect(context.input.value).toBe('Early edit');
      expect(events.localValues).toEqual(['Early edit']);
      expect(events.controlValues).toEqual(['Early edit']);
      expect(events.formValues).toEqual([data('Early edit')]);
      expect(events.outputs).toEqual([change(data('Before input'), data('Early edit'), true, true)]);
    });

    it('preserves an existing touched state while an input makes the control dirty', () => {
      const context = createForm('Before input');
      context.field.formControl$().markAsTouched();
      context.form.controls.name.markAsTouched();
      for (const control of [context.form, context.form.controls.name, context.field.formControl$()]) {
        expect(control.pristine).toBe(true);
        expect(control.touched).toBe(true);
      }
      const events = observeModelWrites(context);
      enterObservedText(context, events, 'Touched edit');
      const expectTouchedAndDirty = () => {
        for (const control of [context.form, context.form.controls.name, context.field.formControl$()]) {
          expect(control.touched).toBe(true);
          expect(control.dirty).toBe(true);
        }
      };
      expectTouchedAndDirty();
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expectTouchedAndDirty();
      expect(context.form.getRawValue()).toEqual(data('Touched edit'));
      expect(events.outputs).toEqual([change(data('Before input'), data('Touched edit'), true, true)]);
    });

    it('keeps a synchronous model correction from the UI output programmatic and publishes later edits normally', () => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      const emailValues: string[] = [];
      const projectedEmail = computed(() => context.directive.valueChanges$()?.email);
      const rootChanges = getRootFormValueChanges$<TestControls, TestUserTypes>(context.form);
      const projectedChangeEmail = computed(() => rootChanges()?.current.value.email);
      projectedEmail();
      projectedChangeEmail();
      const duringOutput: unknown[] = [];
      let corrected = false;
      const subscriptions = [
        context.form.controls.email.valueChanges.subscribe(value => emailValues.push(value)),
        context.directive.valueChanged.subscribe(event => {
          duringOutput.push({form: context.directive.valueChanges$(), context: rootChanges(),
            projectedEmail: projectedEmail(), projectedChangeEmail: projectedChangeEmail()});
          if (event.uiChange && !corrected) {
            corrected = true;
            context.form.controls.email.setValue('normalised@example.test');
          }
        })
      ];
      context.fixture.componentRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

      enterObservedText(context, events, 'First user edit');
      expect(corrected).toBe(true);
      expect(events.outputs).toEqual([
        change(data('Before input'), data('First user edit'), true, true),
        change(data('First user edit'), data('First user edit', 'normalised@example.test'), false, false)
      ]);
      expect(context.form.getRawValue()).toEqual(data('First user edit', 'normalised@example.test'));
      expect(context.emailField.value$()).toBe('normalised@example.test');
      expect(context.emailInput.value).toBe('normalised@example.test');
      expect(context.directive.valueChanges$()).toEqual(data('First user edit', 'normalised@example.test'));
      expect(rootChanges()).toEqual(change(data('First user edit'), data('First user edit', 'normalised@example.test'), false, false));
      expect(projectedEmail()).toBe('normalised@example.test');
      expect(projectedChangeEmail()).toBe('normalised@example.test');
      expect(isChangedByUiUnset(context.form)).toBe(true);

      enterObservedText(context, events, 'Second user edit');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();

      const expectedChanges = [
        change(data('Before input'), data('First user edit'), true, true),
        change(data('First user edit'), data('First user edit', 'normalised@example.test'), false, false),
        change(data('First user edit', 'normalised@example.test'), data('Second user edit', 'normalised@example.test'), true, false)
      ];
      expect(events.outputs).toEqual(expectedChanges);
      expect(duringOutput).toEqual([
        {form: data('First user edit'), context: expectedChanges[0],
          projectedEmail: 'jan@example.test', projectedChangeEmail: 'jan@example.test'},
        {form: data('First user edit', 'normalised@example.test'), context: expectedChanges[1],
          projectedEmail: 'normalised@example.test', projectedChangeEmail: 'normalised@example.test'},
        {form: data('Second user edit', 'normalised@example.test'), context: expectedChanges[2],
          projectedEmail: 'normalised@example.test', projectedChangeEmail: 'normalised@example.test'}
      ]);
      expect(events.controlValues).toEqual(['First user edit', 'Second user edit']);
      expect(emailValues).toEqual(['normalised@example.test']);
      // A nested write can reach raw subscribers before the outer input event resumes.
      expect(events.formValues).toHaveLength(3);
      expect(events.formValues).toEqual(expect.arrayContaining([
        data('First user edit'), data('First user edit', 'normalised@example.test'),
        data('Second user edit', 'normalised@example.test')
      ]));
      expect(events.controlStatuses).toEqual(['VALID', 'VALID']);
      expect(events.formStatuses).toEqual(['VALID', 'VALID', 'VALID']);
      expect(context.field.value$()).toBe('Second user edit');
      expect(context.input.value).toBe('Second user edit');
      expect(context.form.getRawValue()).toEqual(data('Second user edit', 'normalised@example.test'));
      expect(context.directive.valueChanges$()).toEqual(data('Second user edit', 'normalised@example.test'));
      expect(getRootFormValueChanges<TestControls, TestUserTypes>(context.form)).toEqual(expectedChanges[2]);
      expect(isChangedByUiUnset(context.form)).toBe(true);
      expect(context.form.controls.email.pristine).toBe(true);
      expect(context.form.untouched).toBe(true);
    });

    it('keeps same-field model normalization from the UI output instead of restoring the raw input signal', () => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      const projected = computed(() => context.field.value$());
      const projectedFormName = computed(() => context.directive.valueChanges$()?.name);
      const rootChanges = getRootFormValueChanges$<TestControls, TestUserTypes>(context.form);
      const projectedChangeName = computed(() => rootChanges()?.current.value.name);
      expect(projected()).toBe('Before input');
      projectedFormName();
      projectedChangeName();
      const corrections: string[] = [];
      const subscription = context.directive.valueChanged.subscribe(event => {
        if (event.uiChange && typeof event.current.value.name === 'string') {
          const normalized = event.current.value.name.trim();
          if (normalized !== event.current.value.name) {
            corrections.push(normalized);
            context.form.controls.name.setValue(normalized);
          }
        }
      });
      context.fixture.componentRef.onDestroy(() => subscription.unsubscribe());
      const edits = [{raw: '  Anna  ', normalized: 'Anna'}, {raw: '  Ewa  ', normalized: 'Ewa'}];
      const expectedOutputs = [
        change(data('Before input'), data('  Anna  '), true, true),
        change(data('  Anna  '), data('Anna'), false, false),
        change(data('Anna'), data('  Ewa  '), true, false),
        change(data('  Ewa  '), data('Ewa'), false, false)
      ];
      const expectNormalized = (normalized: string) => {
        expect(context.form.controls.name.value).toBe(normalized);
        expect(context.field.formControl$().value).toBe(normalized);
        expect(context.input.value).toBe(normalized);
        expect(context.field.value$()).toBe(normalized);
        expect(projected()).toBe(normalized);
        expect(context.form.value).toEqual(data(normalized));
        expect(context.form.getRawValue()).toEqual(data(normalized));
        expect(context.directive.valueChanges$()).toEqual(data(normalized));
        expect(projectedFormName()).toBe(normalized);
        expect(projectedChangeName()).toBe(normalized);
      };

      edits.forEach(({raw, normalized}, index) => {
        const localCount = events.localValues.length;
        const statusCount = events.localStatuses.length;
        enterText(context.input, raw);
        expectNormalized(normalized);
        // The UI emits once; the nested model-to-view normalization may write silently.
        const notifications = events.localValues.slice(localCount);
        expect(notifications.filter(value => value === raw)).toHaveLength(1);
        expect(notifications.filter(value => value === normalized).length).toBeLessThanOrEqual(1);
        expect(notifications.every(value => value === raw || value === normalized)).toBe(true);
        expect(events.localStatuses.slice(statusCount)).toEqual(notifications.map(() => 'VALID'));
        expect(events.outputs).toEqual(expectedOutputs.slice(0, (index + 1) * 2));
        expect(rootChanges()).toEqual(expectedOutputs[index * 2 + 1]);
      });
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();
      expectNormalized('Ewa');
      expect(corrections).toEqual(['Anna', 'Ewa']);
      expect(events.controlValues).toEqual(['  Anna  ', 'Anna', '  Ewa  ', 'Ewa']);
      expect(events.controlStatuses).toEqual(['VALID', 'VALID', 'VALID', 'VALID']);
      expect(events.formStatuses).toEqual(['VALID', 'VALID', 'VALID', 'VALID']);
      expect(events.formValues).toHaveLength(4);
      expect(events.formValues).toEqual(expect.arrayContaining([data('  Anna  '), data('Anna'), data('  Ewa  '), data('Ewa')]));
      expect(events.outputs).toEqual(expectedOutputs);
      expect(context.form.controls.email.value).toBe('jan@example.test');
      expect(context.emailInput.value).toBe('jan@example.test');
    });

    it('routes alternating sibling edits to their controls and shares the first UI change across the form', () => {
      const context = createForm('Before input');
      const events = observeModelWrites(context);
      const emailValues: string[] = [];
      const subscription = context.form.controls.email.valueChanges.subscribe(value => emailValues.push(value));
      context.fixture.componentRef.onDestroy(() => subscription.unsubscribe());

      enterText(context.input, 'Anna');
      expect(context.emailInput.value).toBe('jan@example.test');
      expect(context.form.controls.email.pristine).toBe(true);
      enterText(context.emailInput, 'anna@example.test');
      expect(context.form.controls.name.value).toBe('Anna');
      expect(context.field.value$()).toBe('Anna');
      expect(context.input.value).toBe('Anna');
      expect(context.emailField.value$()).toBe('anna@example.test');
      enterText(context.input, 'Anna Nowak');
      vi.runOnlyPendingTimers();
      context.fixture.detectChanges();

      expect(events.controlValues).toEqual(['Anna', 'Anna Nowak']);
      expect(emailValues).toEqual(['anna@example.test']);
      expect(events.formValues).toEqual([data('Anna'), data('Anna', 'anna@example.test'), data('Anna Nowak', 'anna@example.test')]);
      expect(events.outputs).toEqual([
        change(data('Before input'), data('Anna'), true, true),
        change(data('Anna'), data('Anna', 'anna@example.test'), true, false),
        change(data('Anna', 'anna@example.test'), data('Anna Nowak', 'anna@example.test'), true, false)
      ]);
      expect(context.form.getRawValue()).toEqual(data('Anna Nowak', 'anna@example.test'));
      expect(context.emailField.formControl$().value).toBe('anna@example.test');
      expect(context.emailInput.value).toBe('anna@example.test');
      for (const field of [context.field, context.emailField]) {
        expect(field.formControl$().dirty).toBe(true);
        expect(field.baseControl$()?.dirty).toBe(true);
        expect(field.formControl$().untouched).toBe(true);
        expect(field.baseControl$()?.untouched).toBe(true);
      }
    });

    it('keeps edits and first UI changes independent between two live forms with identical field paths', () => {
      const first = createForm('First form');
      const second = createForm('Second form');
      const firstEvents = observeModelWrites(first);
      const secondEvents = observeModelWrites(second);
      enterText(first.input, 'First edit');
      expect(second.form.getRawValue()).toEqual(data('Second form'));
      expect(second.field.value$()).toBe('Second form');
      expect(second.input.value).toBe('Second form');
      expect(second.form.pristine).toBe(true);
      expect(secondEvents.outputs).toEqual([]);
      enterText(second.input, 'Second edit');
      expect(first.form.getRawValue()).toEqual(data('First edit'));
      expect(first.input.value).toBe('First edit');
      enterText(first.input, 'First final');
      vi.runOnlyPendingTimers();
      first.fixture.detectChanges();
      second.fixture.detectChanges();

      expect(firstEvents.controlValues).toEqual(['First edit', 'First final']);
      expect(secondEvents.controlValues).toEqual(['Second edit']);
      expect(firstEvents.formValues).toEqual([data('First edit'), data('First final')]);
      expect(secondEvents.formValues).toEqual([data('Second edit')]);
      expect(firstEvents.outputs).toEqual([
        change(data('First form'), data('First edit'), true, true),
        change(data('First edit'), data('First final'), true, false)
      ]);
      expect(secondEvents.outputs).toEqual([change(data('Second form'), data('Second edit'), true, true)]);
      expect(first.field.value$()).toBe('First final');
      expect(second.field.value$()).toBe('Second edit');
      expect(second.input.value).toBe('Second edit');
    });

    it('propagates edits from same-named nested fields once through their own group to the root', () => {
      const fixture = TestBed.createComponent(TestPairedAddressHostComponent);
      fixture.detectChanges();
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
      const directive = fixture.debugElement.query(By.directive(FormDirective))
        .injector.get(FormDirective<PairedAddressControls, never, never>);
      const root = directive.form$();
      const fields = (['billing', 'shipping'] as const).map(key => {
        const host = fixture.debugElement.query(By.css(`[data-testid="${key}"]`));
        const element = host.query(By.css('[data-testid="street"]'));
        return {key, field: element.injector.get(FormFieldDirective<TestFieldValue>),
          directive: host.query(By.directive(FormDirective)).injector.get(FormDirective<AddressControls, never, never>),
          input: element.query(By.css('input')).nativeElement as HTMLInputElement};
      });
      const values: unknown[] = [];
      const outputs: ValueChanges<PairedAddressControls, never>[] = [];
      const childOutputs: unknown[] = [];
      const projectedRoot = computed(() => directive.valueChanges$());
      const projectedGroups = fields.map(({directive: childDirective}) => computed(() => childDirective.valueChanges$()));
      projectedRoot();
      projectedGroups.forEach(projected => projected());
      const duringOutput: unknown[] = [];
      const leafValues = {billing: [] as string[], shipping: [] as string[]};
      const groupValues = {billing: [] as unknown[], shipping: [] as unknown[]};
      const subscriptions = [root.valueChanges.subscribe(value => values.push(value)),
        directive.valueChanged.subscribe(event => {
          outputs.push(event);
          duringOutput.push({root: projectedRoot(), groups: projectedGroups.map(projected => projected())});
        }),
        ...fields.flatMap(({key, directive: childDirective}) => [
          root.controls[key].controls.street.valueChanges.subscribe(value => leafValues[key].push(value)),
          root.controls[key].valueChanges.subscribe(value => groupValues[key].push(value)),
          childDirective.valueChanged.subscribe(value => childOutputs.push(value))
        ])];
      fixture.componentRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));
      const tree = (billing: string, shipping: string) => ({billing: {street: billing}, shipping: {street: shipping}});
      const previous = tree('Lipowa', 'Sosnowa');
      const first = tree('Polna', 'Sosnowa');
      const second = tree('Polna', 'Leśna');
      const final = tree('Łąkowa', 'Leśna');
      const expectFormSignals = (expected: ReturnType<typeof tree>) => {
        expect(directive.valueChanges$()).toEqual(expected);
        expect(projectedRoot()).toEqual(expected);
        expect(fields.map(({directive: childDirective}) => childDirective.valueChanges$()))
          .toEqual([expected.billing, expected.shipping]);
        expect(projectedGroups.map(projected => projected())).toEqual([expected.billing, expected.shipping]);
      };

      enterText(fields[0].input, 'Polna');
      expect(root.getRawValue()).toEqual(first);
      expectFormSignals(first);
      expect(fields.map(({field}) => field.value$())).toEqual(['Polna', 'Sosnowa']);
      expect(root.controls.shipping.pristine).toBe(true);
      expect(fields[1].field.formControl$().pristine).toBe(true);
      enterText(fields[1].input, 'Leśna');
      expect(root.getRawValue()).toEqual(second);
      expectFormSignals(second);
      expect(fields.map(({field}) => field.value$())).toEqual(['Polna', 'Leśna']);
      enterText(fields[0].input, 'Łąkowa');
      expectFormSignals(final);
      vi.runOnlyPendingTimers();
      fixture.detectChanges();

      expect(root.value).toEqual(final);
      expect(root.getRawValue()).toEqual(final);
      expectFormSignals(final);
      expect(duringOutput).toEqual([
        {root: first, groups: [first.billing, first.shipping]},
        {root: second, groups: [second.billing, second.shipping]},
        {root: final, groups: [final.billing, final.shipping]}
      ]);
      expect(fields.map(({field}) => field.formControl$().value)).toEqual(['Łąkowa', 'Leśna']);
      expect(fields.map(({field}) => field.value$())).toEqual(['Łąkowa', 'Leśna']);
      expect(fields.map(({input}) => input.value)).toEqual(['Łąkowa', 'Leśna']);
      expect(leafValues).toEqual({billing: ['Polna', 'Łąkowa'], shipping: ['Leśna']});
      expect(groupValues).toEqual({billing: [{street: 'Polna'}, {street: 'Łąkowa'}], shipping: [{street: 'Leśna'}]});
      expect(values).toEqual([first, second, final]);
      expect(childOutputs).toEqual([]);
      expect(outputs).toEqual([
        {uiChange: true, firstUiChange: true, dataChanged: true, rawDataChanged: true,
          previous: {value: previous, rawValue: previous}, current: {value: first, rawValue: first}},
        {uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
          previous: {value: first, rawValue: first}, current: {value: second, rawValue: second}},
        {uiChange: true, firstUiChange: false, dataChanged: true, rawDataChanged: true,
          previous: {value: second, rawValue: second}, current: {value: final, rawValue: final}}
      ]);
      expect(root.dirty).toBe(true);
      expect(root.untouched).toBe(true);
      for (const {key, field} of fields) {
        expect(Object.is(field.baseControl$(), root.controls[key].controls.street)).toBe(true);
        expect(root.controls[key].dirty).toBe(true);
        expect(root.controls[key].untouched).toBe(true);
      }
    });
  });

  function enterText(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }

  function observeModelWrites({fixture, form, directive, field}: ReturnType<typeof createForm>) {
    const events = {
      controlValues: [] as TestFieldValue[], controlStatuses: [] as FormControlStatus[],
      formValues: [] as unknown[], formStatuses: [] as FormControlStatus[],
      localValues: [] as TestFieldValue[], localStatuses: [] as FormControlStatus[],
      outputs: [] as ValueChanges<TestControls, TestUserTypes>[]
    };
    const subscriptions = [
      form.controls.name.valueChanges.subscribe(value => events.controlValues.push(value)),
      form.controls.name.statusChanges.subscribe(status => events.controlStatuses.push(status)),
      form.valueChanges.subscribe(value => events.formValues.push(value)),
      form.statusChanges.subscribe(status => events.formStatuses.push(status)),
      field.formControl$().valueChanges.subscribe(value => events.localValues.push(value)),
      field.formControl$().statusChanges.subscribe(status => events.localStatuses.push(status)),
      directive.valueChanged.subscribe(event => events.outputs.push(event))
    ];
    fixture.componentRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));
    return events;
  }

  function createForm(initialName: TestFieldValue = 'Jan Kowalski', settle = true) {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.debugElement.injector.get(TestFormService).initialValue = {name: initialName};
    fixture.detectChanges();

    const fieldElement = fixture.debugElement.query(By.css('[data-testid="name"]'));
    const emailElement = fixture.debugElement.query(By.css('[data-testid="email"]'));
    const field = fieldElement.injector.get(FormFieldDirective<TestFieldValue>);
    const emailField = emailElement.injector.get(FormFieldDirective<TestFieldValue>);
    const directive = fixture.debugElement.query(By.directive(FormDirective)).injector.get(FormDirective<TestControls, never, TestUserTypes>);
    const form = directive.form$();
    const input = fieldElement.query(By.css('input')).nativeElement as HTMLInputElement;
    const emailInput = emailElement.query(By.css('input')).nativeElement as HTMLInputElement;
    const nameHost = fieldElement.nativeElement as HTMLElement;
    const emailHost = emailElement.nativeElement as HTMLElement;
    const beforeTimers = {
      baseControl: field.baseControl$(),
      name: field.formControlName$(),
      value: field.value$(),
      localValue: field.formControl$().value,
      inputValue: input.value
    };
    if (settle) {
      vi.runOnlyPendingTimers();
      fixture.detectChanges();
    }
    return {fixture, directive, field, emailField, form, input, emailInput, nameHost, emailHost, beforeTimers};
  }
});
