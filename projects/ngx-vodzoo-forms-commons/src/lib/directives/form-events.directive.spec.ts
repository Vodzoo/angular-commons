import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it} from 'vitest';
import {FormEventsDirective} from './form-events.directive';

@Component({
  standalone: true,
  imports: [FormEventsDirective],
  template: '<div vFormEvents></div>'
})
class TestHostComponent {}

describe('FormEventsDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent]
    });
  });

  it('should create an instance', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement.query(By.directive(FormEventsDirective)).injector.get(FormEventsDirective);
    expect(directive).toBeTruthy();
  });
});
