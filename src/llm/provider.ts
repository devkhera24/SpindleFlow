export interface LLMGenerateParams {
  system: string;
  user: string;
  temperature?: number;
}

export interface LLMProvider {
  name: string;
  generate(params: LLMGenerateParams): Promise<string>;
}
