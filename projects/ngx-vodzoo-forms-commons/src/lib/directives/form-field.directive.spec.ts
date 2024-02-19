import { FormFieldDirective } from './form-field.directive';
import {TestBed} from "@angular/core/testing";
import {ChangeDetectorRef} from "@angular/core";

describe('FormFieldDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers : [ChangeDetectorRef]
    });
  });



  it('should create an instance', () => {
    TestBed.runInInjectionContext(() => {
      const directive = new FormFieldDirective();
      expect(directive).toBeTruthy();
    });
  });
});
