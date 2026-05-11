export interface Activity {
  id: string;
  date: Date;
  week: Date;       // week start (Sunday)
  name: string;
  type: string;     // sport type e.g. "Run", "WeightTraining"
  color: string;    // hex color
  distance: number; // miles
  duration: number; // minutes
  pace: number | null;  // min/mile, null if not applicable
  elevation: number;   // feet
  avgHr: number;
  maxHr: number;
  hrRatio: number;  // 0-1
  zone: number;     // 1-5
  trimp: number;
}

export interface PR {
  kind: string;
  name: string;
  value: string;
  date: Date;
  delta: string;
  color: string;
  fresh: boolean;
  iconKey: 'arrowR' | 'bolt' | 'heart' | 'weight' | 'flame' | 'chart';
}
