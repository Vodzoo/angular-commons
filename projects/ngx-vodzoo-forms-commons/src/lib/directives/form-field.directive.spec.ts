import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it} from 'vitest';
import {FormFieldDirective} from './form-field.directive';

@Component({
  standalone: true,
  imports: [FormFieldDirective],
  template: '<input vFormField>'
})
class TestHostComponent {}

describe('FormFieldDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent]
    });
  });

  it('should create an instance', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement.query(By.directive(FormFieldDirective)).injector.get(FormFieldDirective);
    expect(directive).toBeTruthy();
  });
});
