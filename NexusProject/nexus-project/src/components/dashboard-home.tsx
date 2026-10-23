const navigation = [
  { icon: "space_dashboard", label: "Resumen", active: true },
  { icon: "group", label: "Personas", count: "50" },
  { icon: "hub", label: "Equipos", count: "4 cél." },
  { icon: "warning", label: "Alertas", count: "4 activas", alert: true },
  { icon: "upload_file", label: "Importación de datos" },
  { icon: "analytics", label: "Historial y reportes" },
  { icon: "tune", label: "Configuración del motor" },
  { icon: "admin_panel_settings", label: "Usuarios y permisos" },
];

const metrics = [
  {
    label: "Personas evaluadas",
    value: "50",
    detail: "/ 50",
    tag: "100% dotación activa",
    icon: "groups",
    tone: "success",
    caption: "4 células operativas",
  },
  {
    label: "Riesgo alto",
    value: "4",
    detail: "personas (8.0%)",
    tag: "+1 vs. mes anterior",
    icon: "crisis_alert",
    tone: "danger",
    caption: "Acción inmediata",
  },
  {
    label: "Riesgo medio",
    value: "12",
    detail: "personas (24.0%)",
    tag: "Estable vs. mes anterior",
    icon: "timelapse",
    tone: "",
    caption: "Seguimiento quincenal",
  },
  {
    label: "Incompletas / pendientes",
    value: "2",
    detail: "personas (4.0%)",
    tag: "Sin imputar a riesgo bajo",
    icon: "pending_actions",
    tone: "",
    caption: "Principio de precaución activo",
  },
];

const teams = [
  { name: "Célula Alfa", total: 14, high: 2, medium: 4, low: 8 },
  { name: "Célula Beta", total: 12, high: 1, medium: 3, low: 8 },
  { name: "Célula Gamma", total: 13, high: 1, medium: 4, low: 8 },
  { name: "Célula Delta", total: 11, high: 0, medium: 1, low: 10 },
];

const cases = [
  {
    initials: "MB",
    name: "Mateo Benítez",
    role: "Backend Senior",
    team: "Alfa",
    score: "84 / 100",
    level: "Alto",
    tone: "high",
    factors: ["32h extra", "12d s/descanso", "8 tareas vencidas"],
    recommendation: "Redistribuir backlog y programar franco",
  },
  {
    initials: "LF",
    name: "Lucía Fernández",
    role: "Tech Lead",
    team: "Beta",
    score: "79 / 100",
    level: "Alto",
    tone: "high",
    factors: ["26h extra", "9d s/descanso", "14 tareas concur."],
    recommendation: "Delegar reviews y congelar asignaciones",
  },
  {
    initials: "GM",
    name: "Gonzalo Morales",
    role: "DevOps Engineer",
    team: "Alfa",
    score: "76 / 100",
    level: "Alto",
    tone: "high",
    factors: ["34h extra nocturnas", "Guardias no descansadas"],
    recommendation: "Rotación de guardia con cél. Gamma",
  },
  {
    initials: "CR",
    name: "Camila Rossi",
    role: "QA Automation",
    team: "Gamma",
    score: "72 / 100",
    level: "Alto",
    tone: "high",
    factors: ["22h extra", "28d vac. pendientes"],
    recommendation: "Programar período de receso pendiente",
  },
  {
    initials: "MS",
    name: "Martín Soria",
    role: "Frontend Semi-Senior",
    team: "Alfa",
    score: "58 / 100",
    level: "Medio",
    tone: "medium",
    factors: ["14h extra", "Pico tareas de sprint"],
    recommendation: "Monitoreo preventivo de cierre",
  },
  {
    initials: "SV",
    name: "Sofía Valenzuela",
    role: "Data Analyst",
    team: "Beta",
    score: "—",
    level: "Incompleto",
    tone: "incomplete",
    factors: ["Fichajes de entrada vacíos", "Faltan marcas semana 42"],
    recommendation: "Requiere validación manual en RRHH",
  },
];

const alerts = [
  {
    type: "Crítica · Célula Alfa",
    time: "09:34 hs",
    message:
      "M. Benítez acumuló 12 jornadas sin descanso semanal ininterrumpido.",
    notified: "Notificado: J. Romero (Lead Alfa)",
    status: "Enviado",
    tone: "",
  },
  {
    type: "Crítica · Célula Alfa",
    time: "09:32 hs",
    message:
      "G. Morales superó el límite legal de 30 horas suplementarias mensuales.",
    notified: "Notificado: M. Rossi (RRHH)",
    status: "Enviado",
    tone: "",
  },
  {
    type: "Advertencia · Célula Beta",
    time: "09:31 hs",
    message:
      "L. Fernández tiene 14 tareas concurrentes en sprint de release crítico.",
    notified: "Notificado: Dir. Operaciones",
    status: "Enviado",
    tone: "warning",
  },
  {
    type: "Integridad · Ingesta",
    time: "09:30 hs",
    message:
      "2 colaboradores con inconsistencias de marcas biométricas en semana 42.",
    notified: "Asignado: Soporte RRHH",
    status: "En cola",
    tone: "integrity",
  },
];

const iconPaths: Record<string, string> = {
  monitor_heart: "M3 4h18v12H3V4zm2 2v8h14V6H5zm2 5h2l1-2 2 4 1-2h4v2h-3l-2 3-2-4-1 1H7v-2zM8 19h8v2H8z",
  verified_user: "M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3zm0 2.2 6 2.2V11c0 4-2.5 7.8-6 9-3.5-1.2-6-5-6-9V6.4l6-2.2zm-1 10.4-2-2-1.4 1.4L11 17l5.4-5.4L15 10.2z",
  expand_more: "m7 10 5 5 5-5z",
  space_dashboard: "M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z",
  group: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zM8 11c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V20h14v-3.5C15 14.2 10.3 13 8 13zm8.2.1c-.4 0-.9 0-1.4.1 1.2.8 2.2 1.9 2.2 3.3V20h6v-3.5c0-2.3-4.5-3.4-6.8-3.4z",
  hub: "M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm16 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 8l-4 7 2 1 4-7zm4 1 4 7 2-1-4-7zM8 17h8v2H8z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2zm0-4h-2v-5h2z",
  upload_file: "M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8zm0 2 4 4h-4zM11 18V12l-2 2-1.4-1.4L12 8l4.4 4.6L15 14l-2-2v6z",
  analytics: "M3 3h2v16h16v2H3V3zm4 10 4-4 3 3 6-7 1.5 1.3-7.4 8.7-3-3L8.4 15z",
  tune: "M3 6h11v2H3zm15 0h3v2h-3zM3 11h3v2H3zm7 0h11v2H10zM3 16h9v2H3zm13 0h5v2h-5zM14 4h2v6h-2zM7 9h2v6H7zm7 5h2v6h-2z",
  admin_panel_settings: "M12 2 3 6v6c0 5.5 3.8 9.8 9 11 5.2-1.2 9-5.5 9-11V6zm0 2.2 7 3.1V12c0 4.2-2.8 7.8-7 9-4.2-1.2-7-4.8-7-9V7.3zm0 3.3a3 3 0 0 0-3 3c0 1 .5 1.8 1.2 2.4C8.8 13.4 8 14.3 8 16v1h8v-1c0-1.7-.8-2.6-2.2-3.1A3 3 0 0 0 12 7.5z",
  sync_alt: "M12 4V1L8 5l4 4V6c3.3 0 6 2.7 6 6h2c0-4.4-3.6-8-8-8zm-6 6H4c0 4.4 3.6 8 8 8v3l4-4-4-4v3c-3.3 0-6-2.7-6-6z",
  calendar_month: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zM7 11h4v4H7zm6 0h4v4h-4z",
  arrow_drop_down: "m7 10 5 5 5-5z",
  memory: "M5 5h14v14H5V5zm2 2v10h10V7zm-5 2h3v2H2zm0 4h3v2H2zm17-4h3v2h-3zm0 4h3v2h-3zM9 2h2v3H9zm4 0h2v3h-2zm-4 17h2v3H9zm4 0h2v3h-2z",
  file_upload: "M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8zm0 2 4 4h-4zM13 18h-2v-5l-2 2-1.4-1.4L12 9l4.4 4.6L15 15l-2-2z",
  check_circle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8z",
  verified: "M23 12 20.6 9.3l.3-3.6-3.6-.8L15.5 2 12 3.5 8.5 2 6.7 4.9l-3.6.8.3 3.6L1 12l2.4 2.7-.3 3.6 3.6.8L8.5 22l3.5-1.5 3.5 1.5 1.8-2.9 3.6-.8-.3-3.6zM10 16.5l-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4z",
  shield: "M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm0 2.2 7 3.1V11c0 4.5-2.9 8.8-7 10-4.1-1.2-7-5.5-7-10V6.3z",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z",
  groups: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-7 1.4-7 4v2h14v-2c0-2.6-4.3-4-7-4zm8 .1c-.4 0-.8 0-1.2.1 1.3.9 2.2 2.1 2.2 3.8V19h6v-2c0-2.6-4.3-3.9-7-3.9z",
  crisis_alert: "M12 2 1 21h22L12 2zm1 15h-2v-2h2zm0-4h-2V8h2zm9-7-2-1 2-3 2 1zm-20 0-2-3 2-1 2 3zm17 2 3-1 1 2-3 1zM2 8l3 1-1 2-3-1z",
  timelapse: "M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8zm1 1v9h8A9 9 0 0 0 13 3zm2.2 2.3A7 7 0 0 1 19 10h-4z",
  pending_actions: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H5V9h14v2h2V6a2 2 0 0 0-2-2zm0 3H5V6h14zm-5 7v-3h2v3.2l2.2 1.3-1 1.7zM17 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  trending_up: "M16 6h6v6h-2V9.4l-6.2 6.2-4-4L3 18.2 1.6 16.8l8.2-8.2 4 4L18.6 8H16z",
  check: "m9 16.2-4.2-4.2-1.4 1.4L9 19l12-12-1.4-1.4z",
  horizontal_rule: "M4 11h16v2H4z",
  insights: "M12 3a9 9 0 0 0-5 16.5V22h10v-2.5A9 9 0 0 0 12 3zm3 15.2V20H9v-1.8a7 7 0 1 1 6 0zM11 6h2v6h-2zm1 10a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
  priority_high: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 14h-2V8h2zm0 3h-2v-2h2z",
  search: "M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.8v.8l5 5 1.5-1.5-5-5zm-5 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
  download: "M5 20h14v-2H5zm7-2 6-6h-4V4h-4v8H6z",
  chevron_right: "m9 6 6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6z",
  edit_note: "M3 17.3V21h3.7L18.8 8.9l-3.7-3.7zM21 6.7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7zM3 3h10v2H5v14h14v-8h2v10H3z",
  notifications_active: "M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6v-5a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1zm-14 1 2-2v-4a5 5 0 0 1 10 0v4l2 2z",
  arrow_forward: "M12 4 10.6 5.4l5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8z",
  done_all: "m1 13 4 4 9-9-1.4-1.4L5 14.2l-2.6-2.6zm6 0 4 4L22 6l-1.4-1.4L11 14.2l-2.6-2.6zm7 4 1.4 1.4L23 11l-1.4-1.4z",
  hourglass_top: "M6 2v6l4 4-4 4v6h12v-6l-4-4 4-4V2zm10 14.8V20H8v-3.2l4-4zM8 7.2V4h8v3.2l-4 4z",
};

function Icon({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={iconPaths[children] ?? iconPaths.info} />
    </svg>
  );
}

export default function DashboardHomeView() {
  return (
    <div className="dashboard">
      <aside className="sidebar" aria-label="Navegación principal">
        <div>
          <div className="sidebar-top">
            <div className="brand-mark"><Icon>monitor_heart</Icon></div>
            <div>
              <p className="brand-name">Nexo Laboral</p>
              <p className="brand-subtitle">Nexus Digital · Operaciones</p>
            </div>
          </div>

          <div className="role-badge">
            <span><Icon>verified_user</Icon> RRHH Admin</span>
            <Icon>expand_more</Icon>
          </div>

          <nav className="nav-list" aria-label="Secciones">
            {navigation.map((item) => (
              <div
                className={`nav-item${item.active ? " active" : ""}`}
                key={item.label}
                aria-current={item.active ? "page" : undefined}
              >
                <span className="nav-item-label">
                  <Icon>{item.icon}</Icon>
                  <span>{item.label}</span>
                </span>
                {item.count && (
                  <span className={`nav-counter${item.alert ? " alert" : ""}`}>
                    {item.count}
                  </span>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <strong><Icon>sync_alt</Icon> Fase 1: Ingesta manual CSV/XLSX</strong>
          <span>Motor v1.4.2 activo · 50 colaboradores</span>
          <span>Nexus Digital · Córdoba, AR</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div className="topbar-context">
            <strong>Tablero de Diagnóstico Operativo</strong>
            <span>·</span>
            <span>RRHH</span>
          </div>
          <div className="topbar-actions">
            <span className="topbar-date"><Icon>calendar_month</Icon> Octubre 2024 <Icon>arrow_drop_down</Icon></span>
            <span className="topbar-system"><Icon>memory</Icon> Motor v1.4.2 · 24/10/2024 09:30 hs</span>
            <span className="button-visual"><Icon>file_upload</Icon> Importar datos</span>
          </div>
        </header>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Resumen ejecutivo</p>
              <h1>Resumen de sobrecarga laboral</h1>
              <p className="page-description">
                Área de Operaciones y Desarrollo · Nexus Digital S.R.L. · 50 personas distribuidas en 4 células
              </p>
            </div>
            <span className="status-line"><Icon>check_circle</Icon> Dataset actualizado</span>
          </div>

          <section className="dataset-banner" aria-label="Estado del dataset">
            <div className="dataset-icon"><Icon>verified</Icon></div>
            <div className="dataset-copy">
              <strong>Dataset activo: consolidado_octubre_v2.xlsx</strong>
              <span>Validación de integridad completada sin inconsistencias críticas</span>
            </div>
            <span className="dataset-hash"><Icon>shield</Icon> Hash SHA-256: 7f8a92...e41c</span>
          </section>

          <aside className="method-note">
            <Icon>info</Icon>
            <div>
              <strong>Marco Metodológico de Detección Objetiva</strong>
              <div>
                Indicador preventivo de sobrecarga laboral computado a partir de 4 factores cuantitativos:
                horas extra acumuladas, días consecutivos sin descanso, volumen de tareas asignadas vs.
                completadas y días de licencia pendientes acumulados. Esta métrica no constituye diagnóstico
                médico ni evaluación psicológica; es una herramienta de soporte analítico para la gestión
                preventiva de equipos.
              </div>
            </div>
          </aside>

          <section className="metrics-grid" aria-label="Indicadores principales">
            {metrics.map((metric) => (
              <article className={`metric-card ${metric.tone}`} key={metric.label}>
                <div className="metric-top">
                  <span className="metric-label">{metric.label}</span>
                  <span className="metric-detail"><Icon>{metric.icon}</Icon></span>
                </div>
                <div className="metric-value-row">
                  <span className="metric-value">{metric.value}</span>
                  <span className="metric-detail">{metric.detail}</span>
                </div>
                <div className="metric-bottom">
                  <span className={`metric-tag ${metric.tone}`}>
                    {metric.tone === "danger" && <Icon>trending_up</Icon>}
                    {metric.tone === "success" && <Icon>check</Icon>}
                    {metric.tone === "" && metric.label === "Riesgo medio" && <Icon>horizontal_rule</Icon>}
                    {metric.tag}
                  </span>
                  <span className="metric-caption">{metric.caption}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="analytics-grid" aria-label="Analítica de riesgo">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Evolución temporal del riesgo</h2>
                  <p className="panel-subtitle">Proporción mensual mayo – octubre 2024</p>
                </div>
                <div className="legend" aria-label="Niveles de riesgo">
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#b4232d" }} /> Alto</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#2457a7" }} /> Medio</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#08764e" }} /> Bajo</span>
                </div>
              </div>

              <svg className="chart" viewBox="0 0 540 160" preserveAspectRatio="none" role="img" aria-label="Tendencia de riesgos de mayo a octubre">
                <line stroke="#edf1f8" strokeDasharray="3 3" x1="0" x2="540" y1="40" y2="40" />
                <line stroke="#edf1f8" strokeDasharray="3 3" x1="0" x2="540" y1="80" y2="80" />
                <line stroke="#edf1f8" strokeDasharray="3 3" x1="0" x2="540" y1="120" y2="120" />
                <path d="M 0,90 Q 108,82 216,78 T 432,68 T 540,60 L 540,160 L 0,160 Z" fill="#08764e" fillOpacity=".08" />
                <path d="M 0,90 Q 108,82 216,78 T 432,68 T 540,60" fill="none" stroke="#08764e" strokeWidth="2" />
                <path d="M 0,128 Q 108,124 216,118 T 432,108 T 540,98 L 540,160 L 0,160 Z" fill="#2457a7" fillOpacity=".1" />
                <path d="M 0,128 Q 108,124 216,118 T 432,108 T 540,98" fill="none" stroke="#2457a7" strokeWidth="2" />
                <path d="M 0,152 Q 108,148 216,145 T 432,142 T 540,136 L 540,160 L 0,160 Z" fill="#b4232d" fillOpacity=".13" />
                <path d="M 0,152 Q 108,148 216,145 T 432,142 T 540,136" fill="none" stroke="#b4232d" strokeWidth="2.5" />
                <circle cx="540" cy="60" fill="#08764e" r="4" />
                <circle cx="540" cy="98" fill="#2457a7" r="4" />
                <circle cx="540" cy="136" fill="#b4232d" r="4" />
              </svg>
              <div className="chart-months">
                <span>Mayo 24</span><span>Junio 24</span><span>Julio 24</span>
                <span>Agosto 24</span><span>Septiembre 24</span><strong>Octubre 24 (Actual)</strong>
              </div>
              <div className="trend-note">
                <span><Icon>insights</Icon> Tendencia semestral: El porcentaje de bajo riesgo se contrajo 6% desde agosto debido al release 3.0.</span>
                <span className="trend-index">Índice global: 31.4 / 100</span>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Distribución por célula</h2>
                  <p className="panel-subtitle">Dotación total desglosada por niveles ponderados</p>
                </div>
                <span className="panel-subtitle">4 células</span>
              </div>
              <div className="team-list">
                {teams.map((team) => (
                  <div key={team.name}>
                    <div className="team-heading">
                      <strong>{team.name} ({team.total} pers.)</strong>
                      <span className="team-breakdown">
                        <span className={team.high > 0 ? "text-danger" : ""}>{team.high} Alto</span>
                        {" · "}{team.medium} Medio{" · "}{team.low} Bajo
                      </span>
                    </div>
                    <div className="team-bar" aria-label={`${team.name}: ${team.high} alto, ${team.medium} medio, ${team.low} bajo`}>
                      <span style={{ width: `${(team.high / team.total) * 100}%`, background: "#b4232d" }} />
                      <span style={{ width: `${(team.medium / team.total) * 100}%`, background: "#2457a7" }} />
                      <span style={{ width: `${(team.low / team.total) * 100}%`, background: "#08764e" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="team-alert">
                <Icon>priority_high</Icon>
                <span>Célula Alfa presenta la mayor concentración de riesgo derivado del sprint final de la versión 3.0.</span>
              </div>
            </article>
          </section>

          <section className="panel cases-panel">
            <div className="cases-header">
              <div>
                <h2 className="panel-title">Personas que requieren atención prioritaria</h2>
                <p className="panel-subtitle">
                  Casos identificados por umbrales de riesgo elevado o inconsistencia de registros de jornada
                </p>
              </div>
              <div className="cases-controls" aria-label="Controles visuales">
                <span className="visual-control"><Icon>search</Icon> Buscar por colaborador...</span>
                <span className="visual-control">Todas las células <Icon>expand_more</Icon></span>
                <span className="visual-control">Todos los niveles <Icon>expand_more</Icon></span>
                <span className="visual-control"><Icon>download</Icon> Exportar vista</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="cases-table">
                <thead>
                  <tr>
                    <th>Colaborador / Rol</th><th>Célula</th><th>Índice</th><th>Nivel</th>
                    <th>Factores críticos detectados</th><th>Última eval.</th>
                    <th>Acción recomendada</th><th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((person) => (
                    <tr key={person.initials}>
                      <td>
                        <div className="case-person">
                          <span className={`avatar${person.tone === "incomplete" || person.tone === "medium" ? " neutral" : ""}`}>{person.initials}</span>
                          <span><strong>{person.name}</strong><small>{person.role}</small></span>
                        </div>
                      </td>
                      <td>Célula {person.team}</td>
                      <td className={`risk-score ${person.tone === "high" ? "high" : person.tone === "medium" ? "medium" : ""}`}>{person.score}</td>
                      <td><span className={`risk-pill ${person.tone}`}><span className="risk-dot" />{person.level}</span></td>
                      <td>
                        <div className="factor-list">
                          {person.factors.map((factor) => <span className="factor" key={factor}>{factor}</span>)}
                        </div>
                      </td>
                      <td className="evaluation-date">24/10 09:30</td>
                      <td><span className="recommendation">{person.recommendation}</span></td>
                      <td><Icon className="detail-mark">{person.tone === "incomplete" ? "edit_note" : "chevron_right"}</Icon></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel alerts-panel">
            <div className="panel-header">
              <div className="topbar-context">
                <Icon>notifications_active</Icon>
                <h2 className="panel-title">Últimas alertas automáticas generadas</h2>
              </div>
              <span className="topbar-context">Ver centro de alertas completo <Icon>arrow_forward</Icon></span>
            </div>
            <div className="alerts-grid">
              {alerts.map((alert) => (
                <article className="alert-card" key={alert.time}>
                  <div className="alert-meta">
                    <span className={`alert-type ${alert.tone}`}>{alert.type}</span>
                    <span className="alert-time">{alert.time}</span>
                  </div>
                  <p>{alert.message}</p>
                  <div className="alert-footer">
                    <span>{alert.notified}</span>
                    <span className="delivery-status">
                      <Icon>{alert.status === "Enviado" ? "done_all" : "hourglass_top"}</Icon>
                      {alert.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
