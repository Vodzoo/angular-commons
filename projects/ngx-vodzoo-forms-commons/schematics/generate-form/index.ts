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
  options.fields = options.fields ? JSON.parse(options.fields as any) : [];
  options.commonFieldInputs = options.commonFieldInputs ? JSON.parse(options.commonFieldInputs as any) : [];
  options.formServiceImports = options.formServiceImports ? JSON.parse(options.formServiceImports as any) : [];
  options.formComponentImports = options.formComponentImports ? JSON.parse(options.formComponentImports as any) : [];
  options.formComponentImportsArray = options.formComponentImportsArray ? JSON.parse(options.formComponentImportsArray as any) : [];

  const fields = options.fields
    .map((field) => ({
    ...field,
    formFieldConfigSerialized: transform(field.formFieldConfig),
    formFieldConfigModel: field.formFieldConfigModel || 'any',
    htmlSelector: field.htmlSelector || 'unknown-component',
  }));

  const templateSource = apply(url('./files'), [
    applyTemplates({
      ...strings,
      ...options,
      formSelectorPrefix: options.formSelectorPrefix ?? 'app',
      componentSelectorPrefix: options.componentSelectorPrefix ?? '',
      isCustomFormDirectiveClass: !!options.formDirectiveClass,
      isCustomFormControlsConfigChangeType: !!options.formControlsConfigChangeType,
      isCustomFormConfigDirectiveClass: !!options.formConfigDirectiveClass,
      isCustomFormType: !!options.formType,
      formDirectiveClass: options.formDirectiveClass ? `${options.formDirectiveClass}<${strings.classify(options.name)}>` : `FormDirective<${strings.classify(options.name)}, any, Date>`,
      formConfigDirectiveClass: options.formConfigDirectiveClass ? `${options.formConfigDirectiveClass}<${strings.classify(options.name)}>` : `FormConfigDirective<${strings.classify(options.name)}, any, Date>`,
      formServiceClass: options.formServiceClass ? `${options.formServiceClass}<${strings.classify(options.name)}>` : `FormService<${strings.classify(options.name)}, any, Date>`,
      formType: options.formType ? `${options.formType}<${strings.classify(options.name)}>` : `Form<${strings.classify(options.name)}, any, Date>`,
      formValueType: options.formValueType ? `${options.formValueType}<${strings.classify(options.name)}>` : `FormValue<${strings.classify(options.name)}, Date>`,
      formDisabledStateType: options.formDisabledStateType ? `${options.formDisabledStateType}<${strings.classify(options.name)}>` : `FormDisabledState<${strings.classify(options.name)}, Date>`,
      formValidatorsType: options.formValidatorsType ? `${options.formValidatorsType}<${strings.classify(options.name)}>` : `FormValidators<${strings.classify(options.name)}, Date>`,
      formControlsConfigType: options.formControlsConfigType ? `${options.formControlsConfigType}<${strings.classify(options.name)}>` : `FormControlsConfig<${strings.classify(options.name)}, any, Date>`,
      formControlsConfigChangeType: options.formControlsConfigChangeType ? `${options.formControlsConfigChangeType}<${strings.classify(options.name)}>` : `FormControlsConfigChange<${strings.classify(options.name)}, any, Date>`,
      formControlsLogic2Type: options.formControlsLogic2Type ? `${options.formControlsLogic2Type}<${strings.classify(options.name)}>` : `FormControlsLogic2<${strings.classify(options.name)}, any, Date>`,
      formFieldLogic2FnSpecType: options.formFieldLogic2FnSpecType ? `${options.formFieldLogic2FnSpecType}<${strings.classify(options.name)}>` : `FormFieldLogic2FnSpec<${strings.classify(options.name)}, any, Date>`,
      formFieldConfigType: options.formFieldConfigType ?? 'any',
      fields,
    }),
    move(`${options.path ?? ''}form-${strings.dasherize(options.name)}`)
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
  isCustomFormDirectiveClass: boolean;
  formDirectiveClass: string;
  formConfigDirectiveClass: string;
  formServiceClass: string;
  formServiceImports: string[];
  formComponentImports: string[];
  formComponentImportsArray: string[];
  formValueType: string;
  formType: string;
  formDisabledStateType: string;
  formValidatorsType: string;
  formControlsConfigType: string;
  formControlsConfigChangeType: string;
  formControlsLogic2Type: string;
  formFieldLogic2FnSpecType: string;
  formFieldConfigType: string;
  fields: Field[];
  path: string;
}

interface Field {
  name: string;
  label: string;
  controlModel: string;
  htmlSelector: string;
  formFieldConfigModel: string;
  formFieldConfig: unknown;
  formFieldLogic: unknown;
}
