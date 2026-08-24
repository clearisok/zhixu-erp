import type { TemplateDefinition, TemplateType } from "../model/template-definition";

export interface TemplateRepository {
  list(type?: TemplateType): Promise<TemplateDefinition[]>;
  getById(id: string): Promise<TemplateDefinition | null>;
  getBlob(id: string): Promise<Blob | null>;
  save(definition: TemplateDefinition, blob: Blob): Promise<void>;
  setDefault(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  copy(id: string, definition: TemplateDefinition): Promise<void>;
}
