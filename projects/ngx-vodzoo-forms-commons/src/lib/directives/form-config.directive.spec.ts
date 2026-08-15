import {Component, signal} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {FormControl, FormGroup} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {
  FormConfigDirective,
  FormControlsLogic,
  FormFieldLogicFnSpec
} from './form-config.directive';
import {FormDirective} from './form.directive';
import {FormService} from '../services/form.service';

@Component({
  standalone: true,
  imports: [FormConfigDirective],
  template: '<div vFormConfig></div>'
})
class TestHostComponent {}

describe('FormConfigDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let directive: FormConfigDirective<any, any, any>;
  let form: FormGroup<{
    first: FormControl<string>;
    second: FormControl<string>;
  }>;

  beforeEach(() => {
    form = new FormGroup({
      first: new FormControl('', {nonNullable: true}),
      second: new FormControl('', {nonNullable: true})
    });

    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        {
          provide: FormService,
          useValue: {
            recalculateMethods: [],
            getFormFieldsConfig: () => ({}),
            getFormFieldsLogic: () => ({}),
            reloadConfigSignals: signal(false),
            reloadLogicSignals: signal(false)
          }
        },
        {
          provide: FormDirective,
          useValue: {
            form$: signal(form).asReadonly(),
            formIndex$: signal<number | undefined>(undefined).asReadonly()
          }
        }
      ]
    });

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    directive = fixture.debugElement.query(By.directive(FormConfigDirective)).injector.get(FormConfigDirective);
  });

  it('should create an instance', () => {
    expect(directive).toBeTruthy();
  });

  it('pauses and resumes config change logic', () => {
    const execution = createPausableLogic('onConfigChange');
    directive.formControlsLogic = execution.logic;

    directive.formControlsConfig = {};
    expect(execution.calls).toEqual({first: 0, second: 1});

    execution.pause.set(false);
    directive.formControlsConfig = {};
    expect(execution.calls).toEqual({first: 1, second: 2});
  });

  it('pauses and resumes value change logic', fakeAsync(() => {
    const execution = createPausableLogic('onValueChange');
    directive.formControlsLogic = execution.logic;

    form.controls.first.setValue('first change');
    tick();
    expect(execution.calls).toEqual({first: 0, second: 1});

    execution.pause.set(false);
    form.controls.first.setValue('second change');
    tick();
    expect(execution.calls).toEqual({first: 1, second: 2});
  }));

  it('pauses and resumes recalculation logic', () => {
    const execution = createPausableLogic('onLogicRecalculate');

    directive.formControlsLogic = execution.logic;
    expect(execution.calls).toEqual({first: 0, second: 1});

    execution.pause.set(false);
    directive.formControlsLogic = execution.logic;
    expect(execution.calls).toEqual({first: 1, second: 2});
  });
});

type LogicHook = 'onConfigChange' | 'onValueChange' | 'onLogicRecalculate';

function createPausableLogic(hook: LogicHook): {
  logic: FormControlsLogic<any, any, any>;
  calls: {first: number; second: number};
  pause: ReturnType<typeof signal<boolean>>;
} {
  const calls = {first: 0, second: 0};
  const pause = signal(true);
  const logic = {
    first: (spec: FormFieldLogicFnSpec<any, any, any>) => {
      spec[hook]?.({
        pauseWhen: () => pause(),
        execute: () => {
          calls.first++;
        }
      });
    },
    second: (spec: FormFieldLogicFnSpec<any, any, any>) => {
      spec[hook]?.(() => {
        calls.second++;
      });
    }
  } as FormControlsLogic<any, any, any>;

  return {logic, calls, pause};
}
