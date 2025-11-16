
export enum CartoonStyle {
  Simple = 'simple',
  Vivid = 'vivid',
  Sketch = 'sketch',
}

export interface CartoonCharacter {
  name: string;
  gradient: string;
  gender: 'Male' | 'Female' | 'Neutral';
}
