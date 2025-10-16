import {
  Rule,
  apply,
  url,
  applyTemplates,
  move,
  mergeWith,
  chain
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';

export function generateForm(options: Options): Rule {
  console.log('[OPTIONS]', options);
  options.fields = JSON.parse(options.fields as any);
  if (options.commonFieldInputs) {
    options.commonFieldInputs = JSON.parse(options.commonFieldInputs as any);
  }
  const fields = options.fields
    .map((field) => ({
    ...field,
    formFieldConfigSerialized: transform(field.formFieldConfig),
    formFieldConfigModel: field.formFieldConfigModel || 'any',
    htmlSelector: field.htmlSelector || 'unknown-component',
  }));

  console.log('[FIELDS]', fields);
  const templateSource = apply(url('./files'), [
    applyTemplates({
      ...strings,
      ...options,
      formSelectorPrefix: options.formSelectorPrefix ?? 'app',
      componentSelectorPrefix: options.componentSelectorPrefix ?? '',
      commonFieldInputs: options.commonFieldInputs ?? [],
      formServiceClass: options.formServiceClass ? `${options.formServiceClass}<${strings.classify(options.name)}>` : `FormService<${strings.classify(options.name)}, any, Date>`,
      formValueType: options.formValueType ? `${options.formValueType}<${strings.classify(options.name)}>` : `FormValue<${strings.classify(options.name)}, Date>`,
      formDisabledStateType: options.formDisabledStateType ? `${options.formDisabledStateType}<${strings.classify(options.name)}>` : `FormDisabledState<${strings.classify(options.name)}, Date>`,
      formValidatorsType: options.formValidatorsType ? `${options.formValidatorsType}<${strings.classify(options.name)}>` : `FormValidators<${strings.classify(options.name)}, Date>`,
      formControlsConfigType: options.formControlsConfigType ? `${options.formControlsConfigType}<${strings.classify(options.name)}>` : `FormControlsConfig<${strings.classify(options.name)}, any, Date>`,
      formControlsLogic2Type: options.formControlsLogic2Type ? `${options.formControlsLogic2Type}<${strings.classify(options.name)}>` : `FormControlsLogic2<${strings.classify(options.name)}, any, Date>`,
      formFieldConfigType: options.formFieldConfigType ?? 'any',
      fields
    }),
    move(`form-${strings.dasherize(options.name)}`)
  ]);

  return chain([mergeWith(templateSource)]);
}

function transform(obj: any): string {
  if (Array.isArray(obj)) {
    return `[${obj.map(transform).join(',')}]`;
  } else if (typeof obj === 'object' && obj !== null) {
    return `{${Object.entries(obj)
      .map(([key, value]) => `${key}:${transform(value)}`)
      .join(',')}}`;
  } else if (typeof obj === 'string') {
    return `'${obj}'`;
  } else {
    return obj ? String(obj) : '';
  }
}

interface Options {
  name: string;
  formSelectorPrefix: string;
  componentSelectorPrefix: string;
  commonFieldInputs: string[];
  formServiceClass: string;
  formValueType: string;
  formDisabledStateType: string;
  formValidatorsType: string;
  formControlsConfigType: string;
  formControlsLogic2Type: string;
  formFieldConfigType: string;
  fields: Field[];
}

interface Field {
  name: string;
  label: string;
  controlModel: string;
  htmlSelector: string;
  formFieldConfigModel: string;
  formFieldConfig: unknown;
}
