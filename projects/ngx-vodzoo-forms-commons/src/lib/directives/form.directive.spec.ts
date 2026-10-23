import {Component, computed, Injectable, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormGroup, Validators} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FormService} from '../services/form.service';
import {FormDirective, ShowErrors} from './form.directive';

@Injectable()
class TestFormService extends FormService<any, any, any> {
  override fromGroupConfig(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      email: ['', Validators.required]
    });
  }
}

@Component({
  standalone: true,
  imports: [FormDirective],
  template: '<form vForm [saveDataWithService]="false" [showErrors]="showErrors"></form>'
})
class TestHostComponent {
  showErrors?: ShowErrors<any>;
}

describe('FormDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let directive: FormDirective<any, any, any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        TestFormService,
        {provide: FormService, useExisting: TestFormService}
      ]
    });

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    directive = fixture.debugElement.query(By.directive(FormDirective)).injector.get(FormDirective);
  });

  it('should create an instance', () => {
    expect(directive).toBeTruthy();
  });

  it('increments errorsShown$ and notifies consumers whenever withValue shows errors again', () => {
    const observed = computed(() => directive.errorsShown$());
    expect(observed()).toBeUndefined();

    for (let expected = 1; expected <= 3; expected++) {
      fixture.componentInstance.showErrors = {withValue: false};
      fixture.detectChanges();
      directive.form.reset();
      expect(directive.form.get('name')!.untouched).toBe(true);
      expect(directive.errorsShown$()).toBe(expected === 1 ? undefined : expected - 1);

      fixture.componentInstance.showErrors = {withValue: true};
      fixture.detectChanges();

      expect(directive.form.get('name')!.touched).toBe(true);
      expect(directive.form.get('email')!.touched).toBe(true);
      expect(observed()).toBe(expected);
    }
  });

  it('increments errorsShown$ when checkOn shows errors again for selected controls', () => {
    const trigger = signal(0);
    const name = directive.form.get('name')!;
    const email = directive.form.get('email')!;
    fixture.componentInstance.showErrors = {
      withValue: {show: true, applyTo: [name]},
      checkOn: [trigger]
    };
    fixture.detectChanges();

    for (let expected = 1; expected <= 3; expected++) {
      if (expected > 1) {
        name.markAsUntouched();
        trigger.update(value => value + 1);
        fixture.detectChanges();
      }

      expect(name.touched).toBe(true);
      expect(email.untouched).toBe(true);
      expect(directive.errorsShown$()).toBe(expected);
    }

    fixture.componentInstance.showErrors = {withValue: {show: false, applyTo: [email]}};
    fixture.detectChanges();
    expect(email.untouched).toBe(true);
    expect(directive.errorsShown$()).toBe(3);
  });

  it('increments errorsShown$ on repeated form changes only when withCondition is true', async () => {
    vi.useFakeTimers();
    const name = directive.form.get('name')!;
    fixture.componentInstance.showErrors = {
      withCondition: ({form}) => Boolean(form.get('name')!.value)
    };
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);

    expect(name.untouched).toBe(true);
    expect(directive.errorsShown$()).toBeUndefined();

    for (let expected = 1; expected <= 3; expected++) {
      name.markAsUntouched();
      name.setValue(`name ${expected}`);
      await vi.advanceTimersByTimeAsync(0);

      expect(name.touched).toBe(true);
      expect(directive.errorsShown$()).toBe(expected);
    }

    name.markAsUntouched();
    name.setValue('');
    await vi.advanceTimersByTimeAsync(0);
    expect(name.untouched).toBe(true);
    expect(directive.errorsShown$()).toBe(3);
  });
});
