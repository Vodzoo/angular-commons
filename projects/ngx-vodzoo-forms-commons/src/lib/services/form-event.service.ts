import { Injectable } from '@angular/core';
import {Subject} from "rxjs";
import {FormEvent} from "../directives/form-events.directive";

@Injectable({
  providedIn: 'root'
})
export class FormEventService {
  public events: Subject<FormEvent<any, string, any>> = new Subject();
}
