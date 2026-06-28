const EXT_MAP: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python', pyw: 'python',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  dart: 'dart',
  html: 'html', htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  xml: 'xml', svg: 'xml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql',
  r: 'r',
  lua: 'lua',
  ex: 'elixir', exs: 'elixir',
  hs: 'haskell',
  ml: 'ocaml', mli: 'ocaml',
  clj: 'clojure', cljs: 'clojure',
  vim: 'vim',
  dockerfile: 'docker',
  graphql: 'graphql', gql: 'graphql',
  proto: 'protobuf',
  tf: 'hcl',
};

export function extToLanguage(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  // Handle files like "Dockerfile" with no extension
  if (base.toLowerCase() === 'dockerfile') return 'docker';
  const ext = base.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'text';
}

export function isCodeFile(filename: string): boolean {
  const base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'dockerfile' || base === 'makefile') return true;
  const ext = base.split('.').pop() ?? '';
  return ext in EXT_MAP;
}
