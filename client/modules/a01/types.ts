export type I18n = Record<string, string>;
export interface Step { id: string; ord: number; name_i18n: string }
export interface Decision { node: string; answer: 'yes' | 'no'; justification: string }
export interface Oprp { criteria: Record<string, { answer: 'yes' | 'no'; justification: string }>; justification: string | null; result: string | null; override_candidate: boolean }
export interface Hazard {
  id: string; step_id: string; type: string; description_i18n: string; likelihood: number; severity: number; significant: number;
  control_measure_i18n: string | null; result: string; decisions: Decision[]; oprp: Oprp | null;
}
export interface Parameter {
  id: string; code: string; name_i18n: string; kind: 'numeric' | 'pass_fail'; limit_min: number | null; limit_max: number | null;
  unit: string | null; method_i18n: string; frequency_i18n: string; equipment_id: string | null;
}
export interface ControlPoint {
  id: string; code: string; type: 'CCP' | 'OPRP'; hazard_id: string | null; step_id: string | null; name_i18n: string;
  responsible_role: string; corrective_action_i18n: string; parameters: Parameter[];
}
export interface PlanData {
  plan: {
    id: string; lineage_id: string; version: number; status: string; title_i18n: string; scope: string[];
    wizard_state: Record<string, string>; site_verified_date: string | null; site_verified_by: string | null;
    approved_at: string | null; approved_by_name: string | null; effective_from: string | null;
  };
  team: { id: string; name: string; role: string; competence: string | null }[];
  steps: Step[];
  hazards: Hazard[];
  controlPoints: ControlPoint[];
  versions: { id: string; version: number; status: string }[];
  completeness: Record<string, boolean>;
  settings: { significanceThreshold: number };
}
export interface PlanListItem { id: string; lineage_id: string; version: number; status: string; title_i18n: string }
