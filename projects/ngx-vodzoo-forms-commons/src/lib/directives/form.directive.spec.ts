import {FormDirective} from './form.directive';
import {TestBed} from "@angular/core/testing";
import {ChangeDetectorRef, ElementRef, Injectable} from "@angular/core";
import {FormService} from "../services/form.service";
import {FormGroup} from "@angular/forms";

@Injectable()
class Test extends FormService<any> {
  override fromGroupConfig(): FormGroup {
    return this.fb.group({});
  }
}


describe('FormDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChangeDetectorRef, Test,
        {
          provide: FormService, useExisting: Test,
        },
        {
          provide: ElementRef, useFactory: () => new ElementRef(document.createElement('div')),
        }
      ]
    });
  });

  it('should create an instance', () => {
    TestBed.runInInjectionContext(() => {
      const directive = new FormDirective();
      expect(directive).toBeTruthy();
    });
  });
});
