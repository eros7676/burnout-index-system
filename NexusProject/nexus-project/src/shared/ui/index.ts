// The UI kit (DESIGN.md › Components). Screens compose these; new patterns are added here first.
export { Button, ButtonLink } from "./button";
export { PageHeader, Section, Figure, Columns, Stack } from "./layout";
export { LevelTag, LevelMark, WeekStrip, REGLA_NIVEL, type CeldaSemana } from "./level";
export { Tip, useLectura, type Lectura } from "./tip";
export { StatusTag } from "./status-tag";
export {
  DistributionBar,
  WeekColumns,
  IndexChart,
  FactorBullet,
  type ColumnaSemana,
  type PuntoIndice,
} from "./charts";
export { HoursColumns, type SemanaHoras } from "./hours-columns";
export { TaskBar, TaskLegend, textoTareas, type Tareas } from "./task-bar";
export { Skeleton, SkeletonRows, Empty, ErrorBox, Notice } from "./states";
export { DataTable, tabla } from "./table";
export { WeekDataTable } from "./week-data-table";
export { SelectField, SearchField, Toolbar, FilterBar } from "./field";
export { DateField } from "./date-field";
export { Pagination } from "./pagination";
export { Stepper } from "./stepper";
export {
  TextField,
  TextAreaField,
  SelectFormField,
  CheckboxField,
  Form,
  FormGroup,
  FormActions,
  KeyFacts,
} from "./form";
export { Icon, type Icono } from "./icons";
