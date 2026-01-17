declare module '@xenova/transformers' {
  export interface Pipeline {
    (text: string | string[]): Promise<any>;
  }

  export function pipeline(
    task: string,
    model?: string,
    options?: {
      quantized?: boolean;
      revision?: string;
      progress_callback?: (progress: any) => void;
    }
  ): Promise<Pipeline>;

  export interface FeatureExtractionOutput {
    tolist(): number[][];
    data: Float32Array;
    dims: number[];
  }
}
