// A Power BI report theme, reduced to what Deneb exposes to a spec: host.colorPalette's data
// colours and its named divergent and sentiment colours. Nothing else in a theme is reachable.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectPath, harnessPath } from './paths.ts';

export interface ThemePalette {
  name: string;
  /** host.colorPalette.colors: the theme's data colours. */
  colors: string[];
  /** host.colorPalette's named colours, keyed as Deneb reads them. */
  minimum?: string;
  center?: string;
  maximum?: string;
  negative?: string;
  positive?: string;
  neutral?: string;
}

export const THEMES: Record<string, string> = {
  'bi-nexus': projectPath('theme', 'bi-nexus.json'),
};

export function loadTheme(nameOrPath: string): ThemePalette {
  const file = THEMES[nameOrPath] ?? (path.isAbsolute(nameOrPath) ? nameOrPath : harnessPath(nameOrPath));
  const theme = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const str = (key: string) => (typeof theme[key] === 'string' ? (theme[key] as string) : undefined);
  return {
    name: str('name') ?? nameOrPath,
    colors: (theme.dataColors as string[] | undefined) ?? [],
    minimum: str('minimum'),
    center: str('center'),
    maximum: str('maximum'),
    // Power BI maps the theme's bad / good onto the palette's negative / positive sentiment colours.
    negative: str('bad'),
    positive: str('good'),
    neutral: str('neutral'),
  };
}
