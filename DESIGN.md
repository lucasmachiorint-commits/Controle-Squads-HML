# Design System & Guidelines: Controle de Squads

## Mode
- **Operate**: O usuário realiza tarefas operacionais de gestão de fluxo. Priorizar escaneabilidade, hierarquia visual nítida, feedback imediato e contraste alto em modo escuro (Dark Glassmorphism).

## Palette & Colors
- **Background**: High-contrast Slate Dark (`#0b0f19` / `#0f172a` / `#1e293b`).
- **Squad de Dados**: Emerald Accent (`#10b981` / `#34d399` / `#059669`).
- **Squad de Operações**: Amber/Orange Accent (`#f59e0b` / `#fbbf24` / `#d97706`).
- **Squad de RPA**: Rose/Crimson Accent (`#f43f5e` / `#fb7185` / `#e11d48`).
- **Em Andamento / Cyan**: (`#06b6d4` / `#22d3ee`).
- **Bloqueado / Warning**: Translucent Rose/Pink (`rgba(244, 63, 94, 0.2)` / `#f43f5e`).

## Typography
- **Primary Font**: Plus Jakarta Sans / Inter / System Sans-serif.
- **Headings**: Extra Bold (`font-weight: 800`), uppercase tracked labels for sections.
- **Data & Badges**: Bold compact monospace/sans numbers for GAUs and counts.

## UI Components & Patterns
- **Glass Panels**: `background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;`
- **Tables**: `custom-table` with subtle hover states (`bg-white/5`), clear column widths, and line-height constraints for long titles (`white-space: normal; word-break: break-word; line-height: 1.4;`).
- **Modals**: Smooth backdrop blur (`backdrop-filter: blur(8px)`), rounded corners, dedicated custom followup cards per squad.
- **Charts**: Compact 165px height, cutout 70% doughnut ring, sleek rounded bar charts.

## Anti-Patterns to Avoid
- No plain gray text on colored backgrounds.
- No heavy nested cards inside cards.
- No blocking or synchronous UI locks.
- No generic browser drop-downs without custom dark styling.
