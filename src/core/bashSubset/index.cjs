const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolveAllowedPath } = require('../tools/pathGuard.cjs');

const FORBIDDEN = /[\\"|;&><$`(){}!]/;
const MAX_LINES = 200;
const MAX_MATCHES = 500;

function error(message, line) {
  return { error: line ? `Line ${line}: ${message}` : message };
}

function tokenize(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i += 1;
    if (i >= line.length) break;
    let token = '';
    while (i < line.length && !/\s/.test(line[i])) {
      if (line[i] === "'") {
        i += 1;
        while (i < line.length && line[i] !== "'") {
          if (FORBIDDEN.test(line[i])) throw new Error(`Rejected character ${JSON.stringify(line[i])}`);
          token += line[i++];
        }
        if (line[i] !== "'") throw new Error('Unclosed single quote');
        i += 1;
      } else {
        const char = line[i++];
        if (FORBIDDEN.test(char)) throw new Error(`Rejected character ${JSON.stringify(char)}`);
        if (!/[A-Za-z0-9._/~*?-]/.test(char)) throw new Error(`Invalid token character ${JSON.stringify(char)}`);
        token += char;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

function normalizeName(value) {
  return value.replace(/[\u202f\u00a0 ]+/g, ' ');
}

function expandHome(value, home) {
  if (value.startsWith('~') && !value.startsWith('~/')) throw new Error('Only ~/ home paths are allowed');
  if (value.startsWith('~/')) return path.join(home, value.slice(2));
  if (!path.isAbsolute(value)) throw new Error('Paths must begin with ~/ or /');
  return value;
}

function matchGlob(pattern, name) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(name);
}

function validatePlan(plan, context) {
  if (!plan || !Array.isArray(plan.steps) || Object.keys(plan).some((key) => !['summary', 'steps'].includes(key))) {
    throw new Error('Plan does not match the plan schema');
  }
  if (plan.summary !== undefined && typeof plan.summary !== 'string') throw new Error('Plan does not match the plan schema');
  for (const step of plan.steps) {
    if (!step || typeof step !== 'object' || Object.keys(step).sort().join() !== 'args,tool') {
      throw new Error('Plan does not match the plan schema');
    }
    if (step.tool === 'createFolder' && Object.keys(step.args || {}).join() === 'path') {
      step.args.path = resolveAllowedPath(step.args.path, context);
    } else if (step.tool === 'move' && Object.keys(step.args || {}).sort().join() === 'from,to') {
      step.args.from = resolveAllowedPath(step.args.from, context);
      step.args.to = resolveAllowedPath(step.args.to, context);
    } else if (step.tool === 'rename' && Object.keys(step.args || {}).sort().join() === 'from,to') {
      step.args.from = resolveAllowedPath(step.args.from, context);
      step.args.to = resolveAllowedPath(step.args.to, context);
    } else if (step.tool === 'delete' && Object.keys(step.args || {}).join() === 'path') {
      step.args.path = resolveAllowedPath(step.args.path, context);
    } else throw new Error('Plan does not match the plan schema');
  }
  return plan;
}

function parseBashSubset(text, context = {}) {
  if (typeof text !== 'string') return error('Input must be text');
  const lines = text.split(/\r?\n/);
  const commands = [];
  let summary;
  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index].trim();
    if (!source) continue;
    if (source.startsWith('#')) {
      const summaryMatch = source.match(/^#\s*summary:\s*(.*)$/);
      const questionMatch = source.match(/^#\s*question:\s*(.*)$/);
      if (questionMatch) return { question: questionMatch[1] };
      if (summaryMatch) summary = summaryMatch[1];
      continue;
    }
    commands.push({ source, line: index + 1 });
    if (commands.length > MAX_LINES) return error(`Maximum ${MAX_LINES} non-comment lines exceeded`, index + 1);
  }

  const home = context.homeDir || os.homedir();
  const filesystem = context.fs || fs;
  const steps = [];
  try {
    for (const { source, line } of commands) {
      let tokens;
      try { tokens = tokenize(source); } catch (e) { return error(e.message, line); }
      if (!tokens.length) continue;
      const [command, ...args] = tokens;
      const arities = { mkdir: 1, mv: 2, rm: 1 };
      if (!(command in arities)) return error(`Unknown command ${command}`, line);
      if (args.some((token) => token.startsWith('-'))) return error('Flags are not allowed', line);
      if (args.length !== arities[command]) return error(`${command} expects ${arities[command]} argument${arities[command] === 1 ? '' : 's'}`, line);
      if (args.some((item) => item.split('/').includes('..'))) return error('Path traversal is not allowed', line);
      const paths = args.map((item) => expandHome(item, home));
      const globArg = paths.findIndex((item) => /[*?]/.test(item));
      if (globArg !== -1) {
        if (globArg !== 0 || command === 'mkdir' || /[*?]/.test(path.dirname(paths[globArg]))) return error('Globs are allowed only in the last path segment of a source path', line);
        if ((paths[globArg].match(/[*?]/g) || []).length !== 1) return error('Only one * or ? glob is allowed', line);
        const pattern = paths[globArg];
        const dir = path.dirname(pattern);
        resolveAllowedPath(path.join(dir, '.igriss-glob-probe'), context);
        const names = filesystem.readdirSync(dir);
        const matches = names.filter((name) => matchGlob(path.basename(pattern), name));
        if (!matches.length) return error('Glob matched no files', line);
        if (matches.length > MAX_MATCHES) return error(`Glob matched more than ${MAX_MATCHES} files`, line);
        for (const name of matches) {
          const expanded = [...paths]; expanded[globArg] = path.join(dir, name);
          steps.push(...makeSteps(command, expanded, filesystem, context, line));
        }
      } else {
        steps.push(...makeSteps(command, paths, filesystem, context, line));
      }
    }
    const plan = summary === undefined ? { steps } : { summary, steps };
    return validatePlan(plan, context);
  } catch (e) {
    return error(e.message);
  }
}

function resolveSource(input, filesystem, context) {
  const parent = path.dirname(input);
  const requested = path.basename(input);
  const entries = filesystem.readdirSync(parent);
  const matches = entries.filter((name) => normalizeName(name) === normalizeName(requested));
  if (!matches.length) throw new Error(`Source does not exist: ${input}`);
  if (matches.length > 1) throw new Error(`Source name is ambiguous: ${input}`);
  const actual = path.join(parent, matches[0]);
  resolveAllowedPath(actual, context);
  return actual;
}

function makeSteps(command, paths, filesystem, context, line) {
  try {
    if (command === 'mkdir') return [{ tool: 'createFolder', args: { path: paths[0] } }];
    if (command === 'rm') return [{ tool: 'delete', args: { path: resolveSource(paths[0], filesystem, context) } }];
    const from = resolveSource(paths[0], filesystem, context);
    const toRaw = paths[1];
    const toParent = path.dirname(toRaw);
    let target = toRaw;
    try {
      const children = filesystem.readdirSync(toParent);
      const matches = children.filter((name) => normalizeName(name) === normalizeName(path.basename(toRaw)));
      if (matches.length > 1) throw new Error(`Destination name is ambiguous: ${toRaw}`);
      if (matches.length === 1) target = path.join(toParent, matches[0]);
    } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; }
    return [{ tool: path.dirname(from) === path.dirname(target) ? 'rename' : 'move', args: { from, to: target } }];
  } catch (e) { throw new Error(`Line ${line}: ${e.message}`); }
}

function planTask(text, context = {}) {
  const provider = context.provider;
  if (!provider || typeof provider.generate !== 'function') return Promise.resolve("I couldn't understand that");
  const systemPrompt = `Allowed commands: mkdir PATH, mv SOURCE DESTINATION, rm PATH. No flags or other commands. One command per line. Use exact names from the provided file list and single quotes for names with spaces. Do not use anything else.`;
  return Promise.resolve(provider.generate({ systemPrompt, text, fileList: context.fileList || [], retryError: undefined }))
    .then((output) => {
      const parsed = parseBashSubset(output, context);
      if (!parsed.error) return parsed;
      return Promise.resolve(provider.generate({ systemPrompt, text, fileList: context.fileList || [], retryError: parsed.error }))
        .then((retry) => {
          const result = parseBashSubset(retry, context);
          return result.error ? "I couldn't understand that" : result;
        });
    })
    .catch(() => "I couldn't understand that");
}

module.exports = { parseBashSubset, planTask, tokenize, validatePlan };
