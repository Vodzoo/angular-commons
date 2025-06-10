import {Directive, inject} from '@angular/core';
import {FormEventService} from "../services/form-event.service";
import { AbstractControl } from "@angular/forms";
import {getControlName} from "./form-field.directive";

export interface FormEvent<T, R extends string, V> {
  control?: AbstractControl<T>;
  controlName: string;
  eventType: R;
  value: V;
}

@Directive({
  selector: '[vFormEvents]',
  exportAs: 'vFormEvents',
  standalone: true
})
export class FormEventsDirective {
  private formEventService: FormEventService = inject(FormEventService);
  public emitEvent<T, R extends string, V>(value: Omit<FormEvent<T, R, V>, 'controlName'>): void {
    this.formEventService.events.next({...value, controlName: value.control ? getControlName(value.control) : ''});
  }
}
